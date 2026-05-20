import { randomBytes } from "node:crypto";
import { Prisma, prismaClient } from "@jade/database";
import { hashSecret } from "./agentEnrollment";
import { enqueueAgentJob } from "./agentJobs";

const VPN_TOKEN_PREFIX = "jade_vpn_hub_";
const TUNNEL_POOL_BASE = ipToNumber("100.64.0.0");
const TUNNEL_POOL_SIZE = 1 << 22;
const HUB_TUNNEL_IP = "100.64.0.0";
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
  publicKey?: string;
};

type VisibleServerForVpn = Awaited<ReturnType<typeof findVisibleServerForVpn>>;
type VisiblePeerForVpn = VisibleServerForVpn["vpnPeers"][number];
type DeliveredVpnConfig = {
  serverId: string;
  configRevisionId: string;
  agentJobId: string;
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

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
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
  server: { agents: Array<{ wireguardPublicKey: string | null }> },
) {
  return server.agents.find((agent) => agent.wireguardPublicKey)?.wireguardPublicKey ?? null;
}

async function syncHubPublicKey({
  hub,
  publicKey,
}: {
  hub: Awaited<ReturnType<typeof authenticateHub>>;
  publicKey?: string;
}) {
  const normalizedPublicKey = normalizeOptionalString(publicKey);

  if (!normalizedPublicKey || normalizedPublicKey === hub.publicKey) {
    return hub;
  }

  return await prismaClient.vpnHub.update({
    where: {
      id: hub.id,
    },
    data: {
      publicKey: normalizedPublicKey,
      desiredStateVersion: {
        increment: 1,
      },
    },
  });
}

async function syncVisiblePeerPublicKey({
  server,
  peer,
}: {
  server: VisibleServerForVpn;
  peer: VisiblePeerForVpn;
}): Promise<VisiblePeerForVpn> {
  const publicKey = getLatestAgentPublicKey(server);

  if (!publicKey || publicKey === peer.publicKey) {
    return peer;
  }

  return await prismaClient.$transaction(async (tx) => {
    await tx.vpnHub.update({
      where: {
        id: peer.hubId,
      },
      data: {
        desiredStateVersion: {
          increment: 1,
        },
      },
    });

    return await tx.vpnPeer.update({
      where: {
        id: peer.id,
      },
      data: {
        publicKey,
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
    });
  });
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

async function getPeerForVisibleServer(
  options: VpnPeerLookupOptions,
): Promise<{ server: VisibleServerForVpn; peer: VisiblePeerForVpn }> {
  const server = await findVisibleServerForVpn(options);
  const visiblePeer = server.vpnPeers[0];

  if (!visiblePeer) {
    throw new VpnError("VPN peer has not been provisioned for this server", 404);
  }

  const peer = await syncVisiblePeerPublicKey({ server, peer: visiblePeer });

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
  const allowedIps = [
    `${HUB_TUNNEL_IP}/32`,
    ...sameScopePeers.map((sameScopePeer) => `${sameScopePeer.tunnelIp}/32`),
  ];
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

async function deliverVpnConfigToServer(options: DeliverVpnConfigOptions): Promise<DeliveredVpnConfig> {
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
    serverId: server.id,
    configRevisionId: configRevision.id,
    agentJobId: job.id,
  };
}

async function getScopePeerServerIdsForDelivery({
  hubId,
  scopeId,
  scopeIds,
}: {
  hubId: string;
  scopeId: string | null;
  scopeIds: string[];
}) {
  if (!scopeId || scopeIds.length === 0) {
    return [];
  }

  if (!scopeIds.includes(scopeId)) {
    return [];
  }

  const peers = await prismaClient.vpnPeer.findMany({
    where: {
      hubId,
      enabled: true,
      deletedAt: null,
      server: {
        scopeId,
        deletedAt: null,
      },
    },
    select: {
      serverId: true,
      server: {
        select: {
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
            select: {
              id: true,
            },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return peers
    .filter((peer) => peer.server.agents.length > 0)
    .map((peer) => peer.serverId);
}

export async function deliverVpnConfig(options: DeliverVpnConfigOptions) {
  const primary = await deliverVpnConfigToServer(options);
  const { server, peer } = await getPeerForVisibleServer(options);
  const siblingServerIds = await getScopePeerServerIdsForDelivery({
    hubId: peer.hubId,
    scopeId: server.scopeId,
    scopeIds: options.scopeIds,
  });

  const refreshedPeers = (
    await Promise.all(
      siblingServerIds
        .filter((serverId) => serverId !== server.id)
        .map(async (serverId) => {
          try {
            return await deliverVpnConfigToServer({
              serverId,
              scopeIds: options.scopeIds,
            });
          } catch (error) {
            if (
              error instanceof VpnError &&
              (error.statusCode === 404 || error.statusCode === 409)
            ) {
              return null;
            }

            throw error;
          }
        }),
    )
  ).filter(Boolean);

  return {
    configRevisionId: primary.configRevisionId,
    agentJobId: primary.agentJobId,
    refreshedPeerCount: refreshedPeers.length + 1,
  };
}

export async function getHubDesiredState({ hubId, serviceToken, publicKey }: HubAuth) {
  const authenticatedHub = await authenticateHub({ hubId, serviceToken });
  const hub = await syncHubPublicKey({
    hub: authenticatedHub,
    publicKey,
  });
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
            select: {
              wireguardPublicKey: true,
            },
          },
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
  const peerStates = peers.map((peer) => ({
    peer,
    publicKey: getLatestAgentPublicKey(peer.server) ?? peer.publicKey,
  }));
  const stalePeers = peerStates.filter(({ peer, publicKey }) => publicKey !== peer.publicKey);
  const syncedHub =
    stalePeers.length > 0
      ? await prismaClient.$transaction(async (tx) => {
          await Promise.all(
            stalePeers.map(({ peer, publicKey }) =>
              tx.vpnPeer.update({
                where: {
                  id: peer.id,
                },
                data: {
                  publicKey,
                },
              }),
            ),
          );

          return await tx.vpnHub.update({
            where: {
              id: hub.id,
            },
            data: {
              desiredStateVersion: {
                increment: 1,
              },
            },
          });
        })
      : hub;

  return {
    hub: {
      id: syncedHub.id,
      name: syncedHub.name,
      endpointHost: syncedHub.endpointHost,
      endpointPort: syncedHub.endpointPort,
      publicKey: syncedHub.publicKey,
      desiredStateVersion: syncedHub.desiredStateVersion,
    },
    peers: peerStates.map(({ peer, publicKey }) => ({
      id: peer.id,
      serverId: peer.serverId,
      scopeId: peer.server.scopeId,
      tunnelIp: `${peer.tunnelIp}/32`,
      publicKey,
      allowedIps: [`${peer.tunnelIp}/32`],
      routes: peer.routes.map((route) => route.cidr),
    })),
  };
}

export async function recordHubStatus({
  hubId,
  serviceToken,
  status,
  publicKey,
}: HubAuth & { status: unknown }) {
  const authenticatedHub = await authenticateHub({ hubId, serviceToken });
  const hub = await syncHubPublicKey({
    hub: authenticatedHub,
    publicKey,
  });
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
