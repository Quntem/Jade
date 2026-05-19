import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import wireguardTools from "wireguard-tools.js";

const DEFAULT_OUTPUT_DIR = join(String(Bun.env.HOME ?? "."), ".jade", "vpn-hub");
const DEFAULT_SYNC_INTERVAL_MS = 30_000;
const DEFAULT_WIREGUARD_INTERFACE = "jade-hub0";

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
  interfaceName: string;
  syncIntervalMs: number;
  once: boolean;
  apply: boolean;
  applyBackend: string;
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
    interfaceName: Bun.env.JADE_WIREGUARD_INTERFACE?.trim() || DEFAULT_WIREGUARD_INTERFACE,
    syncIntervalMs: getDurationMs(),
    once: Bun.env.JADE_VPN_HUB_ONCE === "true",
    apply: Bun.env.JADE_VPN_HUB_APPLY === "true",
    applyBackend: Bun.env.JADE_VPN_HUB_APPLY_BACKEND?.trim() || "networkmanager",
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

function isWireGuardToolsBackend(backend: string) {
  return backend === "wireguard-tools.js" || backend === "wireguard-tools";
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
    DNS: [],
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

async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr.trim()}`);
  }

  return stdout.trim();
}

async function runOptionalCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return {
    ok: exitCode === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function applyHubConfig({
  config,
  state,
  privateKey,
}: {
  config: RuntimeConfig;
  state: HubState;
  privateKey: string;
}) {
  if (process.platform !== "linux") {
    throw new Error("Live VPN hub apply is only supported on Linux right now");
  }

  if (isWireGuardToolsBackend(config.applyBackend)) {
    await runOptionalCommand("ip", ["link", "delete", "dev", config.interfaceName]);

    await wireguardTools.setConfig(config.interfaceName, {
      privateKey,
      portListen: state.hub.endpointPort,
      replacePeers: true,
      peers: Object.fromEntries(
        state.peers.map((peer) => [
          peer.publicKey,
          {
            allowedIPs: peer.allowedIps,
          },
        ]),
      ),
    });

    await runCommand("ip", ["link", "set", "dev", config.interfaceName, "up"]);
    await runCommand("ip", ["address", "replace", "100.64.0.0/32", "dev", config.interfaceName]);
    await runCommand("sysctl", ["-w", "net.ipv4.ip_forward=1"]);
    return;
  }

  if (config.applyBackend !== "networkmanager") {
    throw new Error(`Unsupported VPN hub apply backend: ${config.applyBackend}`);
  }

  const networkManagerConfigPath = join(config.outputDir, `${config.interfaceName}.conf`);
  const networkManagerConfig = wireguardTools.wgQuick.stringify({
    privateKey,
    portListen: state.hub.endpointPort,
    DNS: [],
    peers: Object.fromEntries(
      state.peers.map((peer) => [
        peer.publicKey,
        {
          allowedIPs: peer.allowedIps,
        },
      ]),
    ),
  });

  await Bun.write(networkManagerConfigPath, networkManagerConfig);
  await chmodPrivateKey(networkManagerConfigPath);
  await runCommand("nmcli", ["--version"]);

  // Clean up any pre-existing unmanaged interface
  await runOptionalCommand("ip", ["link", "delete", "dev", config.interfaceName]);

  await runOptionalCommand("nmcli", ["connection", "down", config.interfaceName]);
  await runOptionalCommand("nmcli", ["connection", "delete", config.interfaceName]);
  await runCommand("nmcli", [
    "connection",
    "import",
    "type",
    "wireguard",
    "file",
    networkManagerConfigPath,
  ]);
  await runOptionalCommand("nmcli", [
    "connection",
    "modify",
    config.interfaceName,
    "connection.interface-name",
    config.interfaceName,
    "connection.autoconnect",
    "yes",
    "ipv4.method",
    "disabled",
    "ipv6.method",
    "disabled",
  ]);
  await runOptionalCommand("nmcli", ["device", "set", config.interfaceName, "managed", "yes"]);
  await runCommand("nmcli", ["connection", "up", config.interfaceName]);
  await runCommand("ip", ["address", "replace", "100.64.0.0/32", "dev", config.interfaceName]);
  await runCommand("sysctl", ["-w", "net.ipv4.ip_forward=1"]);
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

  if (config.apply) {
    await applyHubConfig({
      config,
      state,
      privateKey: hubKeyPair.privateKey,
    });
  }
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
    "JADE_VPN_HUB_APPLY=false",
    "JADE_VPN_HUB_APPLY_BACKEND=networkmanager",
    `JADE_WIREGUARD_INTERFACE=${DEFAULT_WIREGUARD_INTERFACE}`,
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
