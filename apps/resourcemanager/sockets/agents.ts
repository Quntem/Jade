import type { Server as HttpServer } from "node:http";
import { Prisma, prismaClient } from "@jade/database";
import { Server as SocketIoServer } from "socket.io";
import type { Socket } from "socket.io";
import { hashSecret } from "../functions/agentEnrollment";

const DEFAULT_AGENT_OFFLINE_GRACE_MS = 30_000;
const DEFAULT_AGENT_STALE_MS = 90_000;
const DEFAULT_AGENT_STALE_SWEEP_MS = 30_000;

type AgentSocketData = {
  agentId: string;
  serverId: string;
  credentialId: string;
};

type AgentHeartbeatPayload = {
  hostname?: unknown;
  os?: unknown;
  arch?: unknown;
  version?: unknown;
  capabilities?: unknown;
  metadata?: unknown;
  status?: unknown;
};

const activeAgentSockets = new Map<string, string>();

function getConfiguredDurationMs({
  environmentVariable,
  fallback,
}: {
  environmentVariable: string;
  fallback: number;
}) {
  const configuredDurationMs = Number(process.env[environmentVariable]);

  if (!Number.isFinite(configuredDurationMs) || configuredDurationMs < 0) {
    return fallback;
  }

  return configuredDurationMs;
}

function getOfflineGraceMs() {
  return getConfiguredDurationMs({
    environmentVariable: "AGENT_OFFLINE_GRACE_MS",
    fallback: DEFAULT_AGENT_OFFLINE_GRACE_MS,
  });
}

function getStaleAgentMs() {
  return getConfiguredDurationMs({
    environmentVariable: "AGENT_STALE_MS",
    fallback: DEFAULT_AGENT_STALE_MS,
  });
}

function getStaleAgentSweepMs() {
  return getConfiguredDurationMs({
    environmentVariable: "AGENT_STALE_SWEEP_MS",
    fallback: DEFAULT_AGENT_STALE_SWEEP_MS,
  });
}

function getSocketToken(socket: Socket) {
  const authToken =
    typeof socket.handshake.auth.token === "string"
      ? socket.handshake.auth.token
      : null;

  if (authToken) {
    return authToken;
  }

  const authorization = socket.handshake.headers.authorization;

  if (typeof authorization !== "string") {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function authenticateAgentToken(token: string) {
  const tokenHash = hashSecret(token);

  const credential = await prismaClient.agentCredential.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      agent: {
        deletedAt: null,
        server: {
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      agentId: true,
      agent: {
        select: {
          serverId: true,
        },
      },
    },
  });

  if (!credential) {
    return null;
  }

  await prismaClient.agentCredential.update({
    where: {
      id: credential.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return {
    credentialId: credential.id,
    agentId: credential.agentId,
    serverId: credential.agent.serverId,
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function optionalJsonObject(value: unknown): Prisma.InputJsonValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonValue)
    : undefined;
}

async function markAgentOnline({ agentId, serverId }: AgentSocketData) {
  const now = new Date();

  await prismaClient.$transaction([
    prismaClient.agent.update({
      where: {
        id: agentId,
      },
      data: {
        status: "Online",
        lastSeenAt: now,
      },
    }),
    prismaClient.server.update({
      where: {
        id: serverId,
      },
      data: {
        status: "Online",
        lastSeenAt: now,
      },
    }),
  ]);
}

async function updateHeartbeat({
  agentId,
  serverId,
  payload,
}: AgentSocketData & { payload: AgentHeartbeatPayload }) {
  const now = new Date();
  const hostname = optionalString(payload.hostname);
  const os = optionalString(payload.os);
  const arch = optionalString(payload.arch);
  const version = optionalString(payload.version);
  const capabilities = optionalJsonObject(payload.capabilities);
  const metadata = optionalJsonObject(payload.metadata);
  const agentStatus =
    payload.status === "Degraded" || payload.status === "Online"
      ? payload.status
      : "Online";
  const serverStatus = agentStatus === "Degraded" ? "Degraded" : "Online";

  await prismaClient.$transaction([
    prismaClient.agent.update({
      where: {
        id: agentId,
      },
      data: {
        status: agentStatus,
        lastSeenAt: now,
        ...(version === undefined ? {} : { version }),
        ...(capabilities === undefined ? {} : { capabilities }),
        ...(metadata === undefined ? {} : { metadata }),
      },
    }),
    prismaClient.server.update({
      where: {
        id: serverId,
      },
      data: {
        status: serverStatus,
        lastSeenAt: now,
        ...(hostname === undefined ? {} : { hostname }),
        ...(os === undefined ? {} : { os }),
        ...(arch === undefined ? {} : { arch }),
      },
    }),
  ]);
}

async function markAgentOfflineIfStillDisconnected({
  agentId,
  serverId,
}: AgentSocketData) {
  if (activeAgentSockets.has(agentId)) {
    return;
  }

  await markAgentOffline({ agentId, serverId });
}

async function markAgentOffline({
  agentId,
  serverId,
}: Pick<AgentSocketData, "agentId" | "serverId">) {
  await prismaClient.agent.update({
    where: {
      id: agentId,
    },
    data: {
      status: "Offline",
    },
  });

  const activeAgentCount = await prismaClient.agent.count({
    where: {
      serverId,
      id: {
        not: agentId,
      },
      status: {
        in: ["Online", "Degraded"],
      },
      deletedAt: null,
    },
  });

  if (activeAgentCount === 0) {
    await prismaClient.server.update({
      where: {
        id: serverId,
      },
      data: {
        status: "Offline",
      },
    });
  }
}

async function markStaleAgentsOffline() {
  const staleBefore = new Date(Date.now() - getStaleAgentMs());
  const staleAgents = await prismaClient.agent.findMany({
    where: {
      status: {
        in: ["Online", "Degraded"],
      },
      deletedAt: null,
      OR: [
        {
          lastSeenAt: null,
        },
        {
          lastSeenAt: {
            lt: staleBefore,
          },
        },
      ],
    },
    select: {
      id: true,
      serverId: true,
    },
  });

  for (const agent of staleAgents) {
    await markAgentOffline({
      agentId: agent.id,
      serverId: agent.serverId,
    });
  }
}

function startStaleAgentSweep() {
  const sweepInterval = setInterval(() => {
    markStaleAgentsOffline().catch((error) => {
      console.error("Unable to mark stale agents offline", error);
    });
  }, getStaleAgentSweepMs());

  sweepInterval.unref?.();
}

export function setupAgentSockets(httpServer: HttpServer) {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin: process.env.AGENT_SOCKET_CORS_ORIGIN ?? true,
    },
  });
  const agents = io.of("/agents");

  agents.use(async (socket, next) => {
    const token = getSocketToken(socket);

    if (!token) {
      next(new Error("Missing agent token"));
      return;
    }

    try {
      const agentAuth = await authenticateAgentToken(token);

      if (!agentAuth) {
        next(new Error("Invalid agent token"));
        return;
      }

      socket.data.agent = agentAuth satisfies AgentSocketData;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Agent auth failed"));
    }
  });

  agents.on("connection", async (socket) => {
    const agent = socket.data.agent as AgentSocketData;

    activeAgentSockets.set(agent.agentId, socket.id);
    await socket.join([`agent:${agent.agentId}`, `server:${agent.serverId}`]);
    await markAgentOnline(agent);

    socket.on(
      "agent.heartbeat",
      async (payload: AgentHeartbeatPayload = {}, ack?: (response: unknown) => void) => {
        try {
          await updateHeartbeat({ ...agent, payload });
          ack?.({ ok: true });
        } catch (error) {
          ack?.({
            ok: false,
            error:
              error instanceof Error ? error.message : "Unable to process heartbeat",
          });
        }
      },
    );

    socket.on("disconnect", () => {
      const activeSocketId = activeAgentSockets.get(agent.agentId);

      if (activeSocketId === socket.id) {
        activeAgentSockets.delete(agent.agentId);
      }

      setTimeout(() => {
        markAgentOfflineIfStillDisconnected(agent).catch((error) => {
          console.error("Unable to mark disconnected agent offline", error);
        });
      }, getOfflineGraceMs());
    });
  });

  startStaleAgentSweep();

  return io;
}
