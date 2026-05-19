import { randomBytes } from "node:crypto";
import { Prisma, prismaClient } from "@jade/database";
import { hashSecret } from "./agentEnrollment";
import { enqueueAgentJob } from "./agentJobs";

const VPN_TOKEN_PREFIX = "jade_vpn_hub_";
const TUNNEL_POOL_BASE = ipToNumber("100.64.0.0");
const TUNNEL_POOL_SIZE = 1 << 22;
const DEFAULT_PERSISTENT_KEEPALIVE = 25;

type CreateVpnHubOptions = {
  name: string;
  endpointHost: string;
  endpointPort: number;
  publicKey: string;
  serviceToken?: string;
};

type ProvisionVpnPeerOptions = {
  serverId: string;
  scopeIds: string[];
  hubId?: string;
  wireguardPublicKey?: string;
};

type VpnPeerLookupOptions = {
  serverId: string;
  scopeIds: string[];
};

type DeliverVpnConfigOptions = VpnPeerLookupOptions;

type HubAuth = {
  hubId: string;
  serviceToken: string;
};

function generateToken() {
  return `${VPN_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

function ipToNumber(ip: string) {
  return ip.split(".").reduce((value, octet) => {
    const parsed = Number(octet);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
      throw new Error(`Invalid IPv4 address: ${ip}`);
    }
    return (value << 8) + parsed;
  }, 0) >>> 0;
}

function numberToIp(value: number) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function normalizePort(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new VpnError("endpointPort must be between 1 and 65535", 400);
  }

  return value;
}

function normalizeRequiredString(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new VpnError(`${field} is required`, 400);
  }
  return trimmed;
}

async function getDefaultHub() {
  const hub = await prismaClient.vpnHub.findFirst({
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!hub) {
    throw new VpnError("VPN hub has not been created", 409);
  }

  return hub;
}

async function allocateTunnelIp(tx: Prisma.TransactionClient) {
  const peers = await tx.vpnPeer.findMany({
    select: {
      tunnelIp: true,
    },
  });
  const allocated = new Set(peers.map((peer) => peer.tunnelIp));

  for (let offset = 1; offset < TUNNEL_POOL_SIZE - 1; offset += 1) {
    const tunnelIp = numberToIp(TUNNEL_POOL_BASE + offset);
    if (!allocated.has(tunnelIp)) {
      return tunnelIp;
    }
  }

  throw new VpnError("Jade VPN tunnel IP pool is exhausted", 507);
}

function getLatestAgentPublicKey(
  server: Awaited<ReturnType<typeof findVisibleServerForVpn>>,
) {
  return server.agents.find((agent) => agent.wireguardPublicKey)?.wireguardPublicKey ?? null;
}

async function findVisibleServerForVpn({
  serverId,
  scopeIds,
}: VpnPeerLookupOptions) {
  if (scopeIds.length === 0) {
    throw new VpnError("Server not found", 404);
  }

  const server = await prismaClient.server.findFirst({
    where: {
      id: serverId,
      scopeId: {
        in: scopeIds,
      },
      deletedAt: null,
    },
    include: {
      agents: {
        where: {
          deletedAt: null,
        },
        orderBy: [
          {
            lastSeenAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      },
      vpnPeers: {
        where: {
          deletedAt: null,
        },
        include: {
          hub: true,
          configRevisions: {
            orderBy: {
              revision: "desc",
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!server) {
    throw new VpnError("Server not found", 404);
  }

  return server;
}

async function getPeerForVisibleServer(options: VpnPeerLookupOptions) {
  const server = await findVisibleServerForVpn(options);
  const peer = server.vpnPeers[0];

  if (!peer) {
    throw new VpnError("VPN peer has not been provisioned for this server", 404);
  }

  return { server, peer };
}

async function getSameScopePeers({
  peerId,
  hubId,
  scopeId,
}: {
  peerId: string;
  hubId: string;
  scopeId: string | null;
}) {
  if (!scopeId) {
    return [];
  }

  return await prismaClient.vpnPeer.findMany({
    where: {
      id: {
        not: peerId,
      },
      hubId,
      enabled: true,
      deletedAt: null,
      server: {
        scopeId,
        deletedAt: null,
      },
    },
    orderBy: {
      tunnelIp: "asc",
    },
  });
}

export async function getVpnHubs() {
  return await prismaClient.vpnHub.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      name: true,
      endpointHost: true,
      endpointPort: true,
      publicKey: true,
      status: true,
      lastSeenAt: true,
      desiredStateVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createVpnHub({
  name,
  endpointHost,
  endpointPort,
  publicKey,
  serviceToken,
}: CreateVpnHubOptions) {
  const token = serviceToken?.trim() || generateToken();
  const hub = await prismaClient.vpnHub.create({
    data: {
      name: normalizeRequiredString(name, "name"),
      endpointHost: normalizeRequiredString(endpointHost, "endpointHost"),
      endpointPort: normalizePort(endpointPort),
      publicKey: normalizeRequiredString(publicKey, "publicKey"),
      serviceTokenHash: hashSecret(token),
    },
  });

  return {
    id: hub.id,
    name: hub.name,
    endpointHost: hub.endpointHost,
    endpointPort: hub.endpointPort,
    publicKey: hub.publicKey,
    status: hub.status,
    lastSeenAt: hub.lastSeenAt,
    desiredStateVersion: hub.desiredStateVersion,
    createdAt: hub.createdAt,
    updatedAt: hub.updatedAt,
    serviceToken: token,
  };
}

export async function getVpnPeers({ scopeIds }: { scopeIds: string[] }) {
  if (scopeIds.length === 0) {
    return [];
  }

  return await prismaClient.vpnPeer.findMany({
    where: {
      deletedAt: null,
      server: {
        scopeId: {
          in: scopeIds,
        },
        deletedAt: null,
      },
    },
    include: {
      hub: {
        select: {
          id: true,
          name: true,
          endpointHost: true,
          endpointPort: true,
          publicKey: true,
          status: true,
          desiredStateVersion: true,
        },
      },
      server: {
        select: {
          id: true,
          name: true,
          scopeId: true,
        },
      },
      configRevisions: {
        orderBy: {
          revision: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function provisionVpnPeer({
  serverId,
  scopeIds,
  hubId,
  wireguardPublicKey,
}: ProvisionVpnPeerOptions) {
  const server = await findVisibleServerForVpn({ serverId, scopeIds });
  const hub = hubId
    ? await prismaClient.vpnHub.findFirst({
        where: {
          id: hubId,
          deletedAt: null,
        },
      })
    : await getDefaultHub();

  if (!hub) {
    throw new VpnError("VPN hub not found", 404);
  }

  const publicKey = wireguardPublicKey?.trim() || getLatestAgentPublicKey(server);

  if (!publicKey) {
    throw new VpnError("Server agent has not reported a WireGuard public key", 409);
  }

  return await prismaClient.$transaction(async (tx) => {
    const existingPeer = await tx.vpnPeer.findUnique({
      where: {
        serverId_hubId: {
          serverId: server.id,
          hubId: hub.id,
        },
      },
    });
    const tunnelIp = existingPeer?.tunnelIp ?? (await allocateTunnelIp(tx));
    const peer = existingPeer
      ? await tx.vpnPeer.update({
          where: {
            id: existingPeer.id,
          },
          data: {
            publicKey,
            enabled: true,
            status: "Ready",
            deletedAt: null,
          },
        })
      : await tx.vpnPeer.create({
          data: {
            serverId: server.id,
            hubId: hub.id,
            tunnelIp,
            publicKey,
            status: "Ready",
          },
        });

    await tx.vpnRoute.upsert({
      where: {
        peerId_cidr: {
          peerId: peer.id,
          cidr: `${peer.tunnelIp}/32`,
        },
      },
      create: {
        peerId: peer.id,
        cidr: `${peer.tunnelIp}/32`,
      },
      update: {
        enabled: true,
      },
    });

    await tx.vpnHub.update({
      where: {
        id: hub.id,
      },
      data: {
        desiredStateVersion: {
          increment: 1,
        },
      },
    });

    return peer;
  });
}

export async function renderSpokeConfig(options: VpnPeerLookupOptions) {
  const { server, peer } = await getPeerForVisibleServer(options);
  const sameScopePeers = await getSameScopePeers({
    peerId: peer.id,
    hubId: peer.hubId,
    scopeId: server.scopeId,
  });
  const allowedIps = sameScopePeers.map((sameScopePeer) => `${sameScopePeer.tunnelIp}/32`);
  const endpoint = `${peer.hub.endpointHost}:${peer.hub.endpointPort}`;
  const renderedConfig = [
    "[Interface]",
    `Address = ${peer.tunnelIp}/32`,
    "PrivateKey = <agent-local-wireguard-private-key>",
    "",
    "[Peer]",
    `PublicKey = ${peer.hub.publicKey}`,
    `Endpoint = ${endpoint}`,
    ...(allowedIps.length > 0 ? [`AllowedIPs = ${allowedIps.join(", ")}`] : []),
    `PersistentKeepalive = ${DEFAULT_PERSISTENT_KEEPALIVE}`,
    "",
  ].join("\n");

  return {
    peer,
    serverId: server.id,
    hub: peer.hub,
    tunnelIp: peer.tunnelIp,
    endpoint,
    allowedIps,
    renderedConfig,
  };
}

export async function createVpnConfigRevision(options: VpnPeerLookupOptions) {
  const spokeConfig = await renderSpokeConfig(options);
  const latest = await prismaClient.vpnConfigRevision.findFirst({
    where: {
      peerId: spokeConfig.peer.id,
    },
    orderBy: {
      revision: "desc",
    },
    select: {
      revision: true,
    },
  });
  const revision = (latest?.revision ?? 0) + 1;
  const payload = {
    mode: "dry-run",
    configRevisionId: null,
    serverId: spokeConfig.serverId,
    peerId: spokeConfig.peer.id,
    hubId: spokeConfig.hub.id,
    tunnelIp: spokeConfig.tunnelIp,
    hubEndpoint: spokeConfig.endpoint,
    allowedIps: spokeConfig.allowedIps,
    renderedConfig: spokeConfig.renderedConfig,
  };

  const configRevision = await prismaClient.vpnConfigRevision.create({
    data: {
      peerId: spokeConfig.peer.id,
      hubId: spokeConfig.hub.id,
      revision,
      desiredStateVersion: spokeConfig.hub.desiredStateVersion,
      renderedConfig: spokeConfig.renderedConfig,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  const finalPayload = {
    ...payload,
    configRevisionId: configRevision.id,
  };

  await prismaClient.vpnConfigRevision.update({
    where: {
      id: configRevision.id,
    },
    data: {
      payload: finalPayload as Prisma.InputJsonValue,
    },
  });
  await prismaClient.vpnPeer.update({
    where: {
      id: spokeConfig.peer.id,
    },
    data: {
      lastConfigRevisionId: configRevision.id,
    },
  });

  return {
    ...configRevision,
    payload: finalPayload,
  };
}

export async function deliverVpnConfig(options: DeliverVpnConfigOptions) {
  const { server, peer } = await getPeerForVisibleServer(options);
  const agent = server.agents[0];

  if (!agent) {
    throw new VpnError("Server has no enrolled agent", 409);
  }

  const configRevision = await createVpnConfigRevision(options);
  const job = await enqueueAgentJob({
    agentId: agent.id,
    type: "ConfigureVpn",
    payload: configRevision.payload as Prisma.InputJsonValue,
  });

  await prismaClient.$transaction([
    prismaClient.vpnConfigRevision.update({
      where: {
        id: configRevision.id,
      },
      data: {
        agentJobId: job.id,
        deliveryStatus: "Delivered",
      },
    }),
    prismaClient.vpnPeer.update({
      where: {
        id: peer.id,
      },
      data: {
        status: "Delivered",
      },
    }),
  ]);

  return {
    configRevisionId: configRevision.id,
    agentJobId: job.id,
  };
}

export async function getHubDesiredState({ hubId, serviceToken }: HubAuth) {
  const hub = await authenticateHub({ hubId, serviceToken });
  const peers = await prismaClient.vpnPeer.findMany({
    where: {
      hubId: hub.id,
      enabled: true,
      deletedAt: null,
      server: {
        deletedAt: null,
      },
    },
    include: {
      server: {
        select: {
          id: true,
          scopeId: true,
        },
      },
      routes: {
        where: {
          enabled: true,
        },
        orderBy: {
          cidr: "asc",
        },
      },
    },
    orderBy: {
      tunnelIp: "asc",
    },
  });

  return {
    hub: {
      id: hub.id,
      name: hub.name,
      endpointHost: hub.endpointHost,
      endpointPort: hub.endpointPort,
      publicKey: hub.publicKey,
      desiredStateVersion: hub.desiredStateVersion,
    },
    peers: peers.map((peer) => ({
      id: peer.id,
      serverId: peer.serverId,
      scopeId: peer.server.scopeId,
      tunnelIp: `${peer.tunnelIp}/32`,
      publicKey: peer.publicKey,
      allowedIps: [`${peer.tunnelIp}/32`],
      routes: peer.routes.map((route) => route.cidr),
    })),
  };
}

export async function recordHubStatus({
  hubId,
  serviceToken,
  status,
}: HubAuth & { status: unknown }) {
  const hub = await authenticateHub({ hubId, serviceToken });
  const normalizedStatus =
    status === "Online" || status === "Offline" || status === "Degraded"
      ? status
      : "Unknown";

  return await prismaClient.vpnHub.update({
    where: {
      id: hub.id,
    },
    data: {
      status: normalizedStatus,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      lastSeenAt: true,
    },
  });
}

async function authenticateHub({ hubId, serviceToken }: HubAuth) {
  const hub = await prismaClient.vpnHub.findFirst({
    where: {
      id: hubId,
      serviceTokenHash: hashSecret(serviceToken),
      deletedAt: null,
    },
  });

  if (!hub) {
    throw new VpnError("Invalid VPN hub credentials", 401);
  }

  return hub;
}

export class VpnError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "VpnError";
  }
}
