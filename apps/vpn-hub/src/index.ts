import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import wireguardTools from "wireguard-tools.js";

const DEFAULT_OUTPUT_DIR = join(String(Bun.env.HOME ?? "."), ".jade", "vpn-hub");
const DEFAULT_SYNC_INTERVAL_MS = 30_000;

type HubState = {
  hub: {
    id: string;
    name: string;
    endpointHost: string;
    endpointPort: number;
    publicKey: string;
    desiredStateVersion: number;
  };
  peers: HubPeer[];
};

type HubPeer = {
  id: string;
  serverId: string;
  scopeId: string | null;
  tunnelIp: string;
  publicKey: string;
  allowedIps: string[];
  routes: string[];
};

type HubStatus = "Online" | "Offline" | "Degraded";

type RuntimeConfig = {
  resourceManagerUrl: string;
  hubId: string;
  hubToken: string;
  outputDir: string;
  syncIntervalMs: number;
  once: boolean;
};

type InitConfig = {
  resourceManagerUrl: string | null;
  hubName: string;
  endpointHost: string;
  endpointPort: number;
  outputDir: string;
};

function getRuntimeConfig(): RuntimeConfig {
  return {
    resourceManagerUrl: requiredEnv("JADE_RESOURCE_MANAGER_URL").replace(/\/$/, ""),
    hubId: requiredEnv("JADE_VPN_HUB_ID"),
    hubToken: requiredEnv("JADE_VPN_HUB_TOKEN"),
    outputDir: Bun.env.JADE_VPN_HUB_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    syncIntervalMs: getDurationMs(),
    once: Bun.env.JADE_VPN_HUB_ONCE === "true",
  };
}

function getInitConfig(): InitConfig {
  return {
    resourceManagerUrl: Bun.env.JADE_RESOURCE_MANAGER_URL?.trim().replace(/\/$/, "") || null,
    hubName: Bun.env.JADE_VPN_HUB_NAME?.trim() || "Jade VPN Hub",
    endpointHost: Bun.env.JADE_VPN_HUB_ENDPOINT_HOST?.trim() || "vpn.example.com",
    endpointPort: getInitEndpointPort(),
    outputDir: Bun.env.JADE_VPN_HUB_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
  };
}

function requiredEnv(name: string) {
  const value = Bun.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getDurationMs() {
  const configured = Number(Bun.env.JADE_VPN_HUB_SYNC_INTERVAL_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SYNC_INTERVAL_MS;
  }
  return Math.floor(configured);
}

function getInitEndpointPort() {
  const configured = Number(Bun.env.JADE_VPN_HUB_ENDPOINT_PORT);
  if (!Number.isInteger(configured) || configured < 1 || configured > 65535) {
    return 51820;
  }
  return configured;
}

async function fetchHubState(config: RuntimeConfig) {
  const url = new URL("/v1/vpn/hub-state", config.resourceManagerUrl);
  url.searchParams.set("hubId", config.hubId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.hubToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch hub state (${response.status}): ${await response.text()}`);
  }

  return parseHubState(await response.json());
}

async function reportHubStatus({
  config,
  status,
}: {
  config: RuntimeConfig;
  status: HubStatus;
}) {
  const response = await fetch(`${config.resourceManagerUrl}/v1/vpn/hub-status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.hubToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      hubId: config.hubId,
      status,
    }),
  });

  if (!response.ok) {
    throw new Error(`Unable to report hub status (${response.status}): ${await response.text()}`);
  }
}

function parseHubState(value: unknown): HubState {
  if (!isRecord(value)) {
    throw new Error("Hub state must be an object");
  }

  const hub = parseHub(value.hub);
  const peers = Array.isArray(value.peers)
    ? value.peers.map(parseHubPeer)
    : null;

  if (!peers) {
    throw new Error("Hub state peers must be an array");
  }

  return { hub, peers };
}

function parseHub(value: unknown): HubState["hub"] {
  if (!isRecord(value)) {
    throw new Error("Hub state hub must be an object");
  }

  return {
    id: requiredString(value.id, "hub.id"),
    name: requiredString(value.name, "hub.name"),
    endpointHost: requiredString(value.endpointHost, "hub.endpointHost"),
    endpointPort: requiredNumber(value.endpointPort, "hub.endpointPort"),
    publicKey: requiredString(value.publicKey, "hub.publicKey"),
    desiredStateVersion: requiredNumber(
      value.desiredStateVersion,
      "hub.desiredStateVersion",
    ),
  };
}

function parseHubPeer(value: unknown): HubPeer {
  if (!isRecord(value)) {
    throw new Error("Hub peer must be an object");
  }

  return {
    id: requiredString(value.id, "peer.id"),
    serverId: requiredString(value.serverId, "peer.serverId"),
    scopeId: value.scopeId === null ? null : requiredString(value.scopeId, "peer.scopeId"),
    tunnelIp: requiredString(value.tunnelIp, "peer.tunnelIp"),
    publicKey: requiredString(value.publicKey, "peer.publicKey"),
    allowedIps: requiredStringArray(value.allowedIps, "peer.allowedIps"),
    routes: requiredStringArray(value.routes, "peer.routes"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value;
}

function requiredStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string array`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function renderWireGuardConfig(state: HubState, privateKey: string) {
  const rendered = wireguardTools.wgQuick.stringify({
    privateKey,
    portListen: state.hub.endpointPort,
    peers: Object.fromEntries(
      state.peers.map((peer) => [
        peer.publicKey,
        {
          allowedIPs: peer.allowedIps,
        },
      ]),
    ),
  });
  const annotations = state.peers.map((peer) => (
    `# peerId=${peer.id} serverId=${peer.serverId} scopeId=${peer.scopeId ?? "none"}`
  ));

  return [
    "# Generated by Jade VPN Hub dry-run runtime.",
    "# PrivateKey is generated and stored locally by the hub app.",
    "# Rendered with wireguard-tools.js wgQuick.stringify.",
    ...annotations,
    rendered,
    "",
  ].join("\n");
}

async function ensureHubKeyPair(outputDir: string) {
  const privateKeyPath = join(outputDir, "hub.privatekey");
  const existingPrivateKeyFile = Bun.file(privateKeyPath);

  if (await existingPrivateKeyFile.exists()) {
    const existingPrivateKey = (await existingPrivateKeyFile.text()).trim();
    if (existingPrivateKey.length > 0) {
      return {
        privateKey: existingPrivateKey,
        publicKey: await wireguardTools.key.publicKey(existingPrivateKey),
        privateKeyPath,
        created: false,
      };
    }
  }

  const keyPair = await wireguardTools.key.genKey();
  await mkdir(outputDir, { recursive: true });
  await Bun.write(privateKeyPath, `${keyPair.privateKey}\n`);
  await chmodPrivateKey(privateKeyPath);

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    privateKeyPath,
    created: true,
  };
}

async function chmodPrivateKey(path: string) {
  const chmod = Bun.spawn(["chmod", "600", path]);
  await chmod.exited;
}

function renderRoutingPlan(state: HubState) {
  const peersByScope = new Map<string, HubPeer[]>();

  for (const peer of state.peers) {
    const scopeKey = peer.scopeId ?? "unscoped";
    peersByScope.set(scopeKey, [...(peersByScope.get(scopeKey) ?? []), peer]);
  }

  const lines = [
    "# Generated by Jade VPN Hub dry-run runtime.",
    "# This describes the future per-tenant namespace routing intent.",
    "",
  ];

  for (const [scopeKey, peers] of [...peersByScope.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`[namespace:${namespaceName(scopeKey)}]`);

    for (const peer of peers) {
      lines.push(`peer ${peer.id} server ${peer.serverId} tunnel ${peer.tunnelIp}`);
      for (const route of peer.routes) {
        lines.push(`route ${route} dev wg-jade-hub`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function namespaceName(scopeKey: string) {
  return `jade-${scopeKey.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 48)}`;
}

function renderSummary(state: HubState) {
  return JSON.stringify(
    {
      hubId: state.hub.id,
      hubName: state.hub.name,
      endpoint: `${state.hub.endpointHost}:${state.hub.endpointPort}`,
      desiredStateVersion: state.hub.desiredStateVersion,
      peerCount: state.peers.length,
      scopes: [...new Set(state.peers.map((peer) => peer.scopeId ?? "unscoped"))].sort(),
      renderedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

async function writeRenderedState(config: RuntimeConfig, state: HubState) {
  await mkdir(config.outputDir, { recursive: true });

  const hubKeyPair = await ensureHubKeyPair(config.outputDir);
  const wireGuardConfig = renderWireGuardConfig(state, hubKeyPair.privateKey);
  wireguardTools.wgQuick.parse(wireGuardConfig);
  const routingPlan = renderRoutingPlan(state);
  const summary = renderSummary(state);

  await Promise.all([
    Bun.write(join(config.outputDir, "wg-jade-hub.conf"), wireGuardConfig),
    Bun.write(join(config.outputDir, "routing-plan.txt"), routingPlan),
    Bun.write(join(config.outputDir, "summary.json"), summary),
  ]);
}

async function initHub() {
  const config = getInitConfig();
  const keyPair = await ensureHubKeyPair(config.outputDir);
  const envExamplePath = join(config.outputDir, ".env.example");
  const createHubPayload = {
    name: config.hubName,
    endpointHost: config.endpointHost,
    endpointPort: config.endpointPort,
    publicKey: keyPair.publicKey,
  };
  const envExample = [
    `JADE_RESOURCE_MANAGER_URL=${config.resourceManagerUrl ?? "https://jade.example.com"}`,
    "JADE_VPN_HUB_ID=<created-hub-id>",
    "JADE_VPN_HUB_TOKEN=<created-hub-service-token>",
    `JADE_VPN_HUB_OUTPUT_DIR=${config.outputDir}`,
    `JADE_VPN_HUB_ENDPOINT_HOST=${config.endpointHost}`,
    `JADE_VPN_HUB_ENDPOINT_PORT=${config.endpointPort}`,
    "",
  ].join("\n");

  await mkdir(config.outputDir, { recursive: true });
  await Bun.write(envExamplePath, envExample);

  console.log(keyPair.created ? "Created local hub keypair." : "Reused existing local hub keypair.");
  console.log(`Private key: ${keyPair.privateKeyPath}`);
  console.log(`Public key: ${keyPair.publicKey}`);
  console.log(`Wrote environment template: ${envExamplePath}`);
  console.log("");
  console.log("Create the hub in Resource Manager with:");
  console.log("POST /v1/vpn/hubs");
  console.log(JSON.stringify(createHubPayload, null, 2));
  console.log("");
  console.log("Then run:");
  console.log("JADE_RESOURCE_MANAGER_URL=<resource-manager-url> \\");
  console.log("JADE_VPN_HUB_ID=<created-hub-id> \\");
  console.log("JADE_VPN_HUB_TOKEN=<created-hub-service-token> \\");
  console.log("bun run --cwd apps/vpn-hub start");
}

async function syncOnce(config: RuntimeConfig) {
  const state = await fetchHubState(config);
  await writeRenderedState(config, state);
  await reportHubStatus({ config, status: "Online" });
  console.log(
    `Synced VPN hub ${state.hub.id} version ${state.hub.desiredStateVersion} with ${state.peers.length} peers`,
  );
}

async function run() {
  if (Bun.argv[2] === "init") {
    await initHub();
    return;
  }

  const config = getRuntimeConfig();

  async function syncAndReport() {
    try {
      await syncOnce(config);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      try {
        await reportHubStatus({ config, status: "Degraded" });
      } catch (statusError) {
        console.error(
          statusError instanceof Error
            ? statusError.message
            : statusError,
        );
      }

      if (config.once) {
        process.exitCode = 1;
      }
    }
  }

  await syncAndReport();

  if (config.once) {
    return;
  }

  const interval = setInterval(syncAndReport, config.syncIntervalMs);

  process.on("SIGINT", () => {
    clearInterval(interval);
    reportHubStatus({ config, status: "Offline" }).finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    clearInterval(interval);
    reportHubStatus({ config, status: "Offline" }).finally(() => process.exit(0));
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
