import type { Server as HttpServer } from "node:http";
import { prismaClient } from "@jade/database";
import { Server as SocketIoServer } from "socket.io";
import type { Socket } from "socket.io";
import { hashSecret } from "../functions/agentEnrollment";

const DEFAULT_AGENT_OFFLINE_GRACE_MS = 30_000;

type AgentSocketData = {
  agentId: string;
  serverId: string;
  credentialId: string;
};

const activeAgentSockets = new Map<string, string>();

function getOfflineGraceMs() {
  const configuredGraceMs = Number(process.env.AGENT_OFFLINE_GRACE_MS);

  if (!Number.isFinite(configuredGraceMs) || configuredGraceMs < 0) {
    return DEFAULT_AGENT_OFFLINE_GRACE_MS;
  }

  return configuredGraceMs;
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

async function markAgentOfflineIfStillDisconnected({
  agentId,
  serverId,
}: AgentSocketData) {
  if (activeAgentSockets.has(agentId)) {
    return;
  }

  await prismaClient.agent.update({
    where: {
      id: agentId,
    },
    data: {
      status: "Offline",
    },
  });

  const onlineAgentCount = await prismaClient.agent.count({
    where: {
      serverId,
      id: {
        not: agentId,
      },
      status: "Online",
      deletedAt: null,
    },
  });

  if (onlineAgentCount === 0) {
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

  return io;
}
