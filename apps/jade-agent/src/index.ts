import { mkdir } from "node:fs/promises";
import { hostname, machine, platform, type } from "node:os";
import { dirname, join } from "node:path";
import { io, type Socket } from "socket.io-client";

const DEFAULT_CONFIG_PATH = join(String(Bun.env.HOME ?? "."), ".jade", "agent.json");
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const AGENT_NAME = "jade-agent";
const AGENT_VERSION = "0.1.0";

type AgentConfig = {
  controlUrl: string;
  agentId: string;
  serverId: string;
  agentToken: string;
};

type EnrollmentResponse = {
  agentId: string;
  serverId: string;
  agentToken: string;
};

type AgentJob = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  leaseExpiresAt: string | null;
  resourceId: string | null;
  targetId: string | null;
  deploymentStepId: string | null;
  createdAt: string;
};

function getConfigPath() {
  return Bun.env.JADE_AGENT_CONFIG || DEFAULT_CONFIG_PATH;
}

function getControlUrl() {
  const controlUrl = Bun.env.JADE_CONTROL_URL?.trim();

  if (!controlUrl) {
    throw new Error("JADE_CONTROL_URL is required");
  }

  return controlUrl.replace(/\/$/, "");
}

function getHeartbeatIntervalMs() {
  const heartbeatIntervalMs = Number(Bun.env.JADE_HEARTBEAT_INTERVAL_MS);

  if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) {
    return DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  return heartbeatIntervalMs;
}

async function readConfig() {
  const configPath = getConfigPath();
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return null;
  }

  return (await file.json()) as AgentConfig;
}

async function writeConfig(config: AgentConfig) {
  const configPath = getConfigPath();

  await mkdir(dirname(configPath), { recursive: true });
  await Bun.write(configPath, JSON.stringify(config, null, 2));
  await chmodConfig(configPath);
}

async function chmodConfig(configPath: string) {
  const chmod = Bun.spawn(["chmod", "600", configPath]);
  await chmod.exited;
}

function collectEnrollmentFacts() {
  return {
    name: Bun.env.JADE_SERVER_NAME || hostname(),
    hostname: hostname(),
    os: `${type()} ${platform()}`,
    arch: machine(),
    agentName: AGENT_NAME,
    agentVersion: AGENT_VERSION,
    capabilities: {
      jobs: ["stub"],
    },
    metadata: {
      runtime: "bun",
      pid: process.pid,
    },
  };
}

async function enroll(controlUrl: string) {
  const token = Bun.env.JADE_ENROLLMENT_TOKEN?.trim();

  if (!token) {
    throw new Error(
      `No existing agent config found at ${getConfigPath()} and JADE_ENROLLMENT_TOKEN is not set`,
    );
  }

  const response = await fetch(`${controlUrl}/v1/agents/enroll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      ...collectEnrollmentFacts(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Enrollment failed with status ${response.status}: ${await response.text()}`);
  }

  const enrollment = (await response.json()) as EnrollmentResponse;
  const config = {
    controlUrl,
    agentId: enrollment.agentId,
    serverId: enrollment.serverId,
    agentToken: enrollment.agentToken,
  };

  await writeConfig(config);
  console.log(`Enrolled Jade agent ${config.agentId} for server ${config.serverId}`);

  return config;
}

async function loadOrEnrollConfig() {
  const controlUrl = getControlUrl();
  const existingConfig = await readConfig();

  if (existingConfig) {
    return {
      ...existingConfig,
      controlUrl,
    };
  }

  return await enroll(controlUrl);
}

function createHeartbeatPayload() {
  return {
    hostname: hostname(),
    os: `${type()} ${platform()}`,
    arch: machine(),
    version: AGENT_VERSION,
    status: "Online",
    capabilities: {
      jobs: ["stub"],
    },
    metadata: {
      runtime: "bun",
      pid: process.pid,
      uptimeSeconds: process.uptime(),
    },
  };
}

function sendHeartbeat(socket: Socket) {
  socket.timeout(10_000).emit("agent.heartbeat", createHeartbeatPayload(), (error: Error | null, response: unknown) => {
    if (error) {
      console.error("Heartbeat acknowledgement timed out", error);
      return;
    }

    if (!isOkResponse(response)) {
      console.error("Heartbeat was rejected", response);
    }
  });
}

function registerJobHandlers(socket: Socket) {
  socket.on("job.dispatch", (job: AgentJob) => {
    console.log(`Received job ${job.id} (${job.type}); returning stub success`);
    socket.emit("job.accepted", { jobId: job.id }, () => {
      socket.emit("job.completed", {
        jobId: job.id,
        result: {
          stub: true,
          message: "Job execution is not implemented in this agent yet",
          receivedAt: new Date().toISOString(),
        },
      });
    });
  });
}

function isOkResponse(response: unknown) {
  return Boolean(
    response &&
      typeof response === "object" &&
      "ok" in response &&
      response.ok === true,
  );
}

async function run() {
  const config = await loadOrEnrollConfig();
  const socket = io(`${config.controlUrl}/agents`, {
    auth: {
      token: config.agentToken,
    },
    transports: ["websocket", "polling"],
    reconnection: true,
  });

  registerJobHandlers(socket);

  socket.on("connect", () => {
    console.log(`Connected to Jade control center as agent ${config.agentId}`);
    sendHeartbeat(socket);
  });

  socket.on("connect_error", (error) => {
    console.error("Unable to connect to Jade control center", error.message);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Disconnected from Jade control center: ${reason}`);
  });

  const heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      sendHeartbeat(socket);
    }
  }, getHeartbeatIntervalMs());

  process.on("SIGINT", () => {
    clearInterval(heartbeatInterval);
    socket.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(heartbeatInterval);
    socket.close();
    process.exit(0);
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
