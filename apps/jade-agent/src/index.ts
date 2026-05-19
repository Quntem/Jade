import { mkdir } from "node:fs/promises";
import { hostname, machine, platform, type } from "node:os";
import { dirname, join } from "node:path";
import { io, type Socket } from "socket.io-client";
import wireguardTools from "wireguard-tools.js";

const DEFAULT_CONFIG_PATH = join(String(Bun.env.HOME ?? "."), ".jade", "agent.json");
const DEFAULT_VPN_CONFIG_DIR = join(String(Bun.env.HOME ?? "."), ".jade", "vpn");
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_WIREGUARD_INTERFACE = "jade0";
const AGENT_NAME = "jade-agent";
const AGENT_VERSION = "0.1.0";

type AgentConfig = {
  controlUrl: string;
  agentId: string;
  serverId: string;
  agentToken: string;
  wireguardPrivateKey: string;
  wireguardPublicKey: string;
  lastVpnConfigRevisionId?: string;
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

type WireGuardKeyPair = {
  privateKey: string;
  publicKey: string;
};

type ConfigureVpnPayload = {
  mode?: unknown;
  configRevisionId?: unknown;
  serverId?: unknown;
  peerId?: unknown;
  hubId?: unknown;
  tunnelIp?: unknown;
  hubEndpoint?: unknown;
  allowedIps?: unknown;
  renderedConfig?: unknown;
};

function getConfigPath() {
  return Bun.env.JADE_AGENT_CONFIG || DEFAULT_CONFIG_PATH;
}

function getVpnConfigDir() {
  return Bun.env.JADE_VPN_CONFIG_DIR || DEFAULT_VPN_CONFIG_DIR;
}

function getWireGuardInterfaceName() {
  return Bun.env.JADE_WIREGUARD_INTERFACE?.trim() || DEFAULT_WIREGUARD_INTERFACE;
}

function shouldApplyVpnConfig() {
  return Bun.env.JADE_VPN_APPLY === "true";
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

async function generateWireGuardKeyPair(): Promise<WireGuardKeyPair> {
  return await wireguardTools.key.genKey();
}

async function ensureWireGuardKeys(config: AgentConfig) {
  if (config.wireguardPrivateKey && config.wireguardPublicKey) {
    return config;
  }

  const keyPair = await generateWireGuardKeyPair();
  const nextConfig = {
    ...config,
    wireguardPrivateKey: keyPair.privateKey,
    wireguardPublicKey: keyPair.publicKey,
  };

  await writeConfig(nextConfig);
  return nextConfig;
}

function collectEnrollmentFacts(keyPair: WireGuardKeyPair) {
  return {
    name: Bun.env.JADE_SERVER_NAME || hostname(),
    hostname: hostname(),
    os: `${type()} ${platform()}`,
    arch: machine(),
    agentName: AGENT_NAME,
    agentVersion: AGENT_VERSION,
    wireguardPublicKey: keyPair.publicKey,
    capabilities: {
      jobs: ["ConfigureVpn"],
      vpn: {
        wireguard: true,
        applyMode: shouldApplyVpnConfig() ? "apply" : "dry-run",
      },
    },
    metadata: {
      runtime: "bun",
      pid: process.pid,
    },
  };
}

async function enroll(controlUrl: string, keyPair: WireGuardKeyPair) {
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
      ...collectEnrollmentFacts(keyPair),
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
    wireguardPrivateKey: keyPair.privateKey,
    wireguardPublicKey: keyPair.publicKey,
  };

  await writeConfig(config);
  console.log(`Enrolled Jade agent ${config.agentId} for server ${config.serverId}`);

  return config;
}

async function loadOrEnrollConfig() {
  const controlUrl = getControlUrl();
  const existingConfig = await readConfig();

  if (existingConfig) {
    return await ensureWireGuardKeys({
      ...existingConfig,
      controlUrl,
    });
  }

  const keyPair = await generateWireGuardKeyPair();
  return await enroll(controlUrl, keyPair);
}

function createHeartbeatPayload(config: AgentConfig) {
  return {
    hostname: hostname(),
    os: `${type()} ${platform()}`,
    arch: machine(),
    version: AGENT_VERSION,
    wireguardPublicKey: config.wireguardPublicKey,
    status: "Online",
    capabilities: {
      jobs: ["ConfigureVpn"],
      vpn: {
        wireguard: true,
        applyMode: shouldApplyVpnConfig() ? "apply" : "dry-run",
      },
    },
    metadata: {
      runtime: "bun",
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      vpn: {
        lastConfigRevisionId: config.lastVpnConfigRevisionId ?? null,
      },
    },
  };
}

function sendHeartbeat(socket: Socket, config: AgentConfig) {
  socket.timeout(10_000).emit("agent.heartbeat", createHeartbeatPayload(config), (error: Error | null, response: unknown) => {
    if (error) {
      console.error("Heartbeat acknowledgement timed out", error);
      return;
    }

    if (!isOkResponse(response)) {
      console.error("Heartbeat was rejected", response);
    }
  });
}

function optionalPayloadString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseConfigureVpnPayload(payload: unknown) {
  const candidate =
    payload && typeof payload === "object"
      ? (payload as ConfigureVpnPayload)
      : null;

  if (!candidate) {
    throw new Error("ConfigureVpn payload must be an object");
  }

  const configRevisionId = optionalPayloadString(candidate.configRevisionId);
  const tunnelIp = optionalPayloadString(candidate.tunnelIp);
  const hubEndpoint = optionalPayloadString(candidate.hubEndpoint);
  const renderedConfig = optionalPayloadString(candidate.renderedConfig);

  if (!configRevisionId || !tunnelIp || !hubEndpoint || !renderedConfig) {
    throw new Error("ConfigureVpn payload is missing required fields");
  }

  return {
    configRevisionId,
    tunnelIp,
    hubEndpoint,
    renderedConfig,
    mode: optionalPayloadString(candidate.mode) ?? "dry-run",
    allowedIps: Array.isArray(candidate.allowedIps)
      ? candidate.allowedIps.filter((value): value is string => typeof value === "string")
      : [],
  };
}

async function writeDryRunVpnConfig({
  config,
  payload,
}: {
  config: AgentConfig;
  payload: ReturnType<typeof parseConfigureVpnPayload>;
}) {
  const configDir = getVpnConfigDir();
  const configPath = join(configDir, `${payload.configRevisionId}.conf`);
  const renderedConfig = payload.renderedConfig.replace(
    "<agent-local-wireguard-private-key>",
    config.wireguardPrivateKey,
  );
  const parsedConfig = wireguardTools.wgQuick.parse(renderedConfig);
  const normalizedConfig = wireguardTools.wgQuick.stringify(parsedConfig);

  await mkdir(configDir, { recursive: true });
  await Bun.write(configPath, normalizedConfig);
  await chmodConfig(configPath);

  return {
    configPath,
    parsedConfig,
  };
}

async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr.trim()}`);
  }
}

async function applyVpnConfig({
  payload,
  parsedConfig,
}: {
  payload: ReturnType<typeof parseConfigureVpnPayload>;
  parsedConfig: ReturnType<typeof wireguardTools.wgQuick.parse>;
}) {
  if (process.platform !== "linux") {
    throw new Error("Live VPN apply is only supported on Linux right now");
  }

  const interfaceName = getWireGuardInterfaceName();

  await wireguardTools.setConfig(interfaceName, {
    privateKey: parsedConfig.privateKey,
    replacePeers: true,
    peers: parsedConfig.peers,
  });
  await runCommand("ip", ["address", "replace", `${payload.tunnelIp}/32`, "dev", interfaceName]);
  await runCommand("ip", ["link", "set", "dev", interfaceName, "up"]);

  for (const allowedIp of payload.allowedIps) {
    await runCommand("ip", ["route", "replace", allowedIp, "dev", interfaceName]);
  }
}

async function handleConfigureVpnJob(socket: Socket, config: AgentConfig, job: AgentJob) {
  const payload = parseConfigureVpnPayload(job.payload);
  const { configPath, parsedConfig } = await writeDryRunVpnConfig({ config, payload });
  const applyEnabled = shouldApplyVpnConfig();

  if (applyEnabled) {
    await applyVpnConfig({ payload, parsedConfig });
  }

  const nextConfig = {
    ...config,
    lastVpnConfigRevisionId: payload.configRevisionId,
  };

  await writeConfig(nextConfig);
  config.lastVpnConfigRevisionId = payload.configRevisionId;
  socket.emit("job.completed", {
    jobId: job.id,
    result: {
      dryRun: !applyEnabled,
      applied: applyEnabled,
      mode: applyEnabled ? "apply" : payload.mode,
      configRevisionId: payload.configRevisionId,
      tunnelIp: payload.tunnelIp,
      hubEndpoint: payload.hubEndpoint,
      allowedIps: payload.allowedIps,
      storedConfigPath: configPath,
      interfaceName: getWireGuardInterfaceName(),
      receivedAt: new Date().toISOString(),
    },
  });
}

function registerJobHandlers(socket: Socket, config: AgentConfig) {
  socket.on("job.dispatch", (job: AgentJob) => {
    console.log(`Received job ${job.id} (${job.type})`);
    socket.emit("job.accepted", { jobId: job.id }, () => {
      if (job.type === "ConfigureVpn") {
        handleConfigureVpnJob(socket, config, job).catch((error) => {
          socket.emit("job.failed", {
            jobId: job.id,
            error: error instanceof Error ? error.message : "Unable to handle VPN config",
            result: {
              receivedAt: new Date().toISOString(),
            },
          });
        });
        return;
      }

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

  registerJobHandlers(socket, config);

  socket.on("connect", () => {
    console.log(`Connected to Jade control center as agent ${config.agentId}`);
    sendHeartbeat(socket, config);
  });

  socket.on("connect_error", (error) => {
    console.error("Unable to connect to Jade control center", error.message);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Disconnected from Jade control center: ${reason}`);
  });

  const heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      sendHeartbeat(socket, config);
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
