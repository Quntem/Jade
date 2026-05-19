import type { Server as HttpServer } from "node:http";
import { Prisma, prismaClient } from "@jade/database";
import { Server as SocketIoServer } from "socket.io";
import type { Namespace } from "socket.io";
import type { Socket } from "socket.io";
import { hashSecret } from "../functions/agentEnrollment";
import {
  completeAgentJob,
  failAgentJob,
  leaseQueuedJobsForAgent,
  markJobAccepted,
  recordJobProgress,
} from "../functions/agentJobs";

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
  wireguardPublicKey?: unknown;
  capabilities?: unknown;
  metadata?: unknown;
  status?: unknown;
};

type AgentJobEventPayload = {
  jobId?: unknown;
  result?: unknown;
  error?: unknown;
};

const activeAgentSockets = new Map<string, string>();
let agentNamespace: Namespace | null = null;

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

function jsonValueOrEmptyObject(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) {
    return {};
  }

  return value as Prisma.InputJsonValue;
}

function getJobId(payload: AgentJobEventPayload) {
  return typeof payload.jobId === "string" && payload.jobId.trim().length > 0
    ? payload.jobId.trim()
    : null;
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
  const wireguardPublicKey = optionalString(payload.wireguardPublicKey);
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
        ...(wireguardPublicKey === undefined ? {} : { wireguardPublicKey }),
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

function serializeJobForAgent(job: Awaited<ReturnType<typeof leaseQueuedJobsForAgent>>[number]) {
  return {
    id: job.id,
    type: job.type,
    payload: job.payload,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    leaseExpiresAt: job.leaseExpiresAt,
    resourceId: job.resourceId,
    targetId: job.targetId,
    deploymentStepId: job.deploymentStepId,
    createdAt: job.createdAt,
  };
}

async function dispatchQueuedJobs(socket: Socket, agent: AgentSocketData) {
  const jobs = await leaseQueuedJobsForAgent({ agentId: agent.agentId });

  for (const job of jobs) {
    socket.emit("job.dispatch", serializeJobForAgent(job));
  }
}

export async function dispatchQueuedJobsToOnlineAgent(agentId: string) {
  if (!agentNamespace) {
    return;
  }

  const socketId = activeAgentSockets.get(agentId);

  if (!socketId) {
    return;
  }

  const socket = agentNamespace.sockets.get(socketId);

  if (!socket) {
    activeAgentSockets.delete(agentId);
    return;
  }

  const agent = socket.data.agent as AgentSocketData | undefined;

  if (!agent) {
    return;
  }

  await dispatchQueuedJobs(socket, agent);
}

function registerJobHandlers(socket: Socket, agent: AgentSocketData) {
  socket.on(
    "job.accepted",
    async (payload: AgentJobEventPayload = {}, ack?: (response: unknown) => void) => {
      const jobId = getJobId(payload);

      if (!jobId) {
        ack?.({ ok: false, error: "jobId is required" });
        return;
      }

      const job = await markJobAccepted({ agentId: agent.agentId, jobId });

      ack?.(
        job
          ? { ok: true }
          : { ok: false, error: "Job is not leased to this agent" },
      );
    },
  );

  socket.on(
    "job.progress",
    async (payload: AgentJobEventPayload = {}, ack?: (response: unknown) => void) => {
      const jobId = getJobId(payload);

      if (!jobId) {
        ack?.({ ok: false, error: "jobId is required" });
        return;
      }

      const job = await recordJobProgress({
        agentId: agent.agentId,
        jobId,
        result: jsonValueOrEmptyObject(payload.result),
      });

      ack?.(
        job
          ? { ok: true }
          : { ok: false, error: "Job is not active for this agent" },
      );
    },
  );

  socket.on(
    "job.completed",
    async (payload: AgentJobEventPayload = {}, ack?: (response: unknown) => void) => {
      const jobId = getJobId(payload);

      if (!jobId) {
        ack?.({ ok: false, error: "jobId is required" });
        return;
      }

      const job = await completeAgentJob({
        agentId: agent.agentId,
        jobId,
        result: jsonValueOrEmptyObject(payload.result),
      });

      ack?.(
        job
          ? { ok: true }
          : { ok: false, error: "Job is not active for this agent" },
      );

      if (job) {
        await dispatchQueuedJobs(socket, agent);
      }
    },
  );

  socket.on(
    "job.failed",
    async (payload: AgentJobEventPayload = {}, ack?: (response: unknown) => void) => {
      const jobId = getJobId(payload);

      if (!jobId) {
        ack?.({ ok: false, error: "jobId is required" });
        return;
      }

      const job = await failAgentJob({
        agentId: agent.agentId,
        jobId,
        error: optionalString(payload.error),
        result: jsonValueOrEmptyObject(payload.result),
      });

      ack?.(
        job
          ? { ok: true, status: job.status }
          : { ok: false, error: "Job is not active for this agent" },
      );

      if (job?.status === "Queued") {
        await dispatchQueuedJobs(socket, agent);
      }
    },
  );
}

export function setupAgentSockets(httpServer: HttpServer) {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin: process.env.AGENT_SOCKET_CORS_ORIGIN ?? true,
    },
  });
  const agents = io.of("/agents");
  agentNamespace = agents;

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
    registerJobHandlers(socket, agent);
    await dispatchQueuedJobs(socket, agent);

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
