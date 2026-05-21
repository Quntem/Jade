import { Prisma, prismaClient } from "@jade/database";
import { enqueueAgentJob } from "./agentJobs";
import { dispatchQueuedJobsToOnlineAgent } from "../sockets/agents";

type BucketPlacement = {
  serverIds: string[];
  primaryServerId: string;
  primaryHost: string;
};

type SeaweedFsBucketSpec = {
  bucketName: string;
  placement: BucketPlacement;
  ports: {
    master: number;
    filer: number;
    s3: number;
    volume: number;
  };
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  install: {
    binaryName: string;
    packageSource: string;
  };
};

type SeaweedFsBucketStatus = {
  phase: "Planning" | "Deploying" | "Running" | "Failed";
  deploymentId: string | null;
  gatewayUrl: string | null;
  masterUrl: string | null;
  installedServers: string[];
  failedServers: string[];
  lastError: string | null;
  connection: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  } | null;
};

type CreateSeaweedFsBucketOptions = {
  scopeId: string;
  createdBy: string;
  name: string;
  bucketName: string;
  serverIds: string[];
  primaryServerId?: string;
  scopeIds: string[];
};

type RunCommandPayload = {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

const DEFAULT_PORTS = {
  master: 9333,
  filer: 8888,
  s3: 8333,
  volume: 8080,
};

function normalizeName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("A resource name is required");
  }

  return trimmed;
}

function normalizeBucketName(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    throw new Error("A bucket name is required");
  }

  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(trimmed)) {
    throw new Error("Bucket names must be lowercase S3-compatible names");
  }

  return trimmed;
}

function firstVisibleAgent(server: {
  agents: Array<{
    id: string;
    deletedAt: Date | null;
    createdAt: Date;
    status: "Unknown" | "Online" | "Offline" | "Degraded";
    lastSeenAt: Date | null;
  }>;
}) {
  return server.agents
    .filter((agent) => agent.deletedAt === null)
    .filter((agent) => agent.status === "Online" || agent.status === "Degraded")
    .sort((first, second) => {
      const firstSeen = first.lastSeenAt?.getTime() ?? first.createdAt.getTime();
      const secondSeen = second.lastSeenAt?.getTime() ?? second.createdAt.getTime();

      return secondSeen - firstSeen;
    })[0];
}

function buildInstallScript({
  bucketName,
  primaryHost,
  ownHost,
  isPrimary,
}: {
  bucketName: string;
  primaryHost: string;
  ownHost: string;
  isPrimary: boolean;
}) {
  const dataDir = "$HOME/.jade/seaweedfs";
  const imageName = "localhost/jade-seaweedfs:latest";

  return [
    "set -euo pipefail",
    `mkdir -p "${dataDir}/build" "${dataDir}/containers" "${dataDir}/build/weed-image"`,
    "if ! command -v podman >/dev/null 2>&1; then",
    '  echo "podman is required to deploy SeaweedFS containers" >&2',
    "  exit 1",
    "fi",
    `IMAGE_NAME="${imageName}"`,
    `CONTAINER_NAME="jade-seaweedfs-${bucketName}-${isPrimary ? "primary" : "volume"}"`,
    `CONTAINER_DATA_DIR="${dataDir}/containers/$CONTAINER_NAME"`,
    `BUILD_CONTEXT_DIR="${dataDir}/build/weed-image"`,
    'archName="$(uname -m)"',
    "case \"${archName}\" in",
    "  x86_64|amd64) weed_arch=amd64 ;;",
    "  aarch64|arm64) weed_arch=arm64 ;;",
    "  *) echo \"Unsupported CPU architecture for SeaweedFS bootstrap: ${archName}\" >&2; exit 1 ;;",
    "esac",
    "cat > \"${BUILD_CONTEXT_DIR}/Containerfile\" <<'EOF'",
    "FROM docker.io/library/alpine:3.20",
    "RUN apk add --no-cache ca-certificates curl tar",
    "ARG WEED_ARCH",
    "RUN set -eux; \\",
    "    archive=\"linux_${WEED_ARCH}.tar.gz\"; \\",
    "    curl -fsSL \"https://github.com/seaweedfs/seaweedfs/releases/latest/download/${archive}\" -o /tmp/seaweedfs.tgz; \\",
    "    tar -xzf /tmp/seaweedfs.tgz -C /usr/local/bin weed; \\",
    "    chmod +x /usr/local/bin/weed; \\",
    "    rm -f /tmp/seaweedfs.tgz",
    "COPY run-seaweedfs.sh /usr/local/bin/run-seaweedfs.sh",
    "RUN chmod +x /usr/local/bin/run-seaweedfs.sh",
    "ENTRYPOINT [\"/usr/local/bin/run-seaweedfs.sh\"]",
    "EOF",
    "cat > \"${BUILD_CONTEXT_DIR}/run-seaweedfs.sh\" <<'EOF'",
    "#!/bin/sh",
    "set -eu",
    "",
    'WEED_BIN="/usr/local/bin/weed"',
    'PRIMARY_HOST="${PRIMARY_HOST:?PRIMARY_HOST is required}"',
    'OWN_HOST="${OWN_HOST:?OWN_HOST is required}"',
    'BUCKET_NAME="${BUCKET_NAME:-}"',
    'SEAWEEDFS_ROLE="${SEAWEEDFS_ROLE:-volume}"',
    'DATA_DIR="${SEAWEEDFS_DATA_DIR:-/data}"',
    'LOG_DIR="${DATA_DIR}/logs"',
    'MASTER_DIR="${DATA_DIR}/master"',
    'FILER_DIR="${DATA_DIR}/filer"',
    'VOLUME_DIR="${DATA_DIR}/volume"',
    "mkdir -p \"$LOG_DIR\" \"$MASTER_DIR\" \"$FILER_DIR\" \"$VOLUME_DIR\"",
    'if [ "$SEAWEEDFS_ROLE" = "primary" ]; then',
    '  "$WEED_BIN" master -mdir="$MASTER_DIR" -ip=0.0.0.0 > "$LOG_DIR/master.log" 2>&1 &',
    '  master_pid=$!',
    "  sleep 3",
    '  "$WEED_BIN" volume -dir="$VOLUME_DIR" -master=127.0.0.1:9333 -ip=0.0.0.0 -port=8080 > "$LOG_DIR/volume.log" 2>&1 &',
    '  volume_pid=$!',
    '  "$WEED_BIN" filer -defaultStoreDir="$FILER_DIR" -master=127.0.0.1:9333 -ip=0.0.0.0 -port=8888 > "$LOG_DIR/filer.log" 2>&1 &',
    '  filer_pid=$!',
    '  "$WEED_BIN" s3 -filer=127.0.0.1:8888 -port=8333 > "$LOG_DIR/s3.log" 2>&1 &',
    '  s3_pid=$!',
    "  sleep 8",
    '  if [ -n "$BUCKET_NAME" ]; then',
    '    printf "s3.bucket.create -name %s\\n" "$BUCKET_NAME" | "$WEED_BIN" shell -master=127.0.0.1:9333 > "$LOG_DIR/shell.log" 2>&1 || true',
    "  fi",
    '  wait "$master_pid" "$volume_pid" "$filer_pid" "$s3_pid"',
    "else",
    '  "$WEED_BIN" volume -dir="$VOLUME_DIR" -master="${PRIMARY_HOST}:9333" -ip=0.0.0.0 -port=8080 > "$LOG_DIR/volume.log" 2>&1 &',
    '  volume_pid=$!',
    '  wait "$volume_pid"',
    "fi",
    "EOF",
    "chmod +x \"${BUILD_CONTEXT_DIR}/run-seaweedfs.sh\"",
    "if ! podman image exists \"$IMAGE_NAME\" >/dev/null 2>&1; then",
    "  podman build --pull-always --tag \"$IMAGE_NAME\" --build-arg WEED_ARCH=\"$weed_arch\" \"${BUILD_CONTEXT_DIR}\"",
    "fi",
    "mkdir -p \"${CONTAINER_DATA_DIR}\"",
    "podman rm -f \"$CONTAINER_NAME\" >/dev/null 2>&1 || true",
    `podman run -d --name "$CONTAINER_NAME" --replace --network host --pull never --log-driver=none --stop-timeout=10 -e SEAWEEDFS_ROLE="${isPrimary ? "primary" : "volume"}" -e PRIMARY_HOST="${primaryHost}" -e OWN_HOST="${ownHost}" -e BUCKET_NAME="${bucketName}" -e SEAWEEDFS_DATA_DIR=/data -v "$CONTAINER_DATA_DIR:/data:Z" "$IMAGE_NAME"`,
    'sleep 5',
  ].join("\n");
}

function createBucketStatus({
  deploymentId,
  gatewayUrl,
  masterUrl,
  installedServers,
  failedServers,
  lastError = null,
  connection = null,
}: {
  deploymentId: string;
  gatewayUrl: string | null;
  masterUrl: string | null;
  installedServers: string[];
  failedServers: string[];
  lastError?: string | null;
  connection?: SeaweedFsBucketStatus["connection"];
}): SeaweedFsBucketStatus {
  return {
    phase: lastError ? "Failed" : "Deploying",
    deploymentId,
    gatewayUrl,
    masterUrl,
    installedServers,
    failedServers,
    lastError,
    connection,
  };
}

function createBucketResourceSpec({
  bucketName,
  serverIds,
  primaryServerId,
  primaryHost,
}: {
  bucketName: string;
  serverIds: string[];
  primaryServerId: string;
  primaryHost: string;
}): SeaweedFsBucketSpec {
  return {
    bucketName,
    placement: {
      serverIds,
      primaryServerId,
      primaryHost,
    },
    ports: DEFAULT_PORTS,
    credentials: {
      accessKeyId: "admin",
      secretAccessKey: "secret",
    },
    install: {
      binaryName: "podman",
      packageSource: "seaweedfs release image built locally with podman",
    },
  };
}

export async function createSeaweedFsBucketResource({
  scopeId,
  createdBy,
  name,
  bucketName,
  serverIds,
  primaryServerId,
  scopeIds,
}: CreateSeaweedFsBucketOptions) {
  const normalizedName = normalizeName(name);
  const normalizedBucketName = normalizeBucketName(bucketName);

  if (serverIds.length === 0) {
    throw new Error("At least one server must be selected");
  }

  const visibleServers = await prismaClient.server.findMany({
    where: {
      id: {
        in: serverIds,
      },
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
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (visibleServers.length !== serverIds.length) {
    throw new Error("One or more selected servers are not visible");
  }

  const resolvedPrimaryServerId =
    primaryServerId && serverIds.includes(primaryServerId) ? primaryServerId : serverIds[0];

  const primaryServer = visibleServers.find((server) => server.id === resolvedPrimaryServerId);

  if (!primaryServer) {
    throw new Error("At least one server must be selected");
  }

  const primaryHost = primaryServer.hostname?.trim();

  if (!primaryHost) {
    throw new Error("The primary server needs a hostname before it can host SeaweedFS");
  }

  for (const server of visibleServers) {
    if (!server.hostname?.trim()) {
      throw new Error(`Server ${server.name} is missing a hostname`);
    }
    if (!firstVisibleAgent(server)) {
      throw new Error(`Server ${server.name} does not have an online agent`);
    }
  }

  const deployment = await prismaClient.deployment.create({
    data: {
      scopeId,
      createdBy,
      status: "Planning",
      summary: `SeaweedFS bucket deployment for ${normalizedBucketName}`,
      plan: {
        bucketName: normalizedBucketName,
        serverIds,
        primaryServerId: primaryServer.id,
      } as Prisma.InputJsonValue,
    },
  });

  const spec = createBucketResourceSpec({
    bucketName: normalizedBucketName,
    serverIds,
    primaryServerId: primaryServer.id,
    primaryHost,
  });

  const resource = await prismaClient.resource.create({
    data: {
      scopeId,
      createdBy,
      type: "jade.storage.bucket",
      name: normalizedName,
      spec: spec as Prisma.InputJsonValue,
      status: createBucketStatus({
        deploymentId: deployment.id,
        gatewayUrl: `http://${primaryHost}:${DEFAULT_PORTS.s3}`,
        masterUrl: `http://${primaryHost}:${DEFAULT_PORTS.master}`,
        installedServers: [],
        failedServers: [],
        connection: null,
      }) as Prisma.InputJsonValue,
      provider: "seaweedfs",
      phase: "Deploying",
      health: "Unknown",
    },
  });

  await prismaClient.deployment.update({
    where: {
      id: deployment.id,
    },
    data: {
      resourceId: resource.id,
      targetId: null,
    },
  });

  let order = 1;

  for (const server of visibleServers) {
    const agent = firstVisibleAgent(server);

    if (!agent) {
      throw new Error(`No agent is available for ${server.name}`);
    }

    const isPrimary = server.id === primaryServer.id;
    const script = buildInstallScript({
      bucketName: normalizedBucketName,
      primaryHost,
      ownHost: server.hostname?.trim() ?? primaryHost,
      isPrimary,
    });

    const step = await prismaClient.deploymentStep.create({
      data: {
        deploymentId: deployment.id,
        resourceId: resource.id,
        order,
        name: isPrimary ? `Install SeaweedFS and bootstrap ${normalizedBucketName}` : `Install SeaweedFS on ${server.name}`,
        action: "RunCommand",
        provider: "seaweedfs",
        targetId: null,
        input: {
          serverId: server.id,
          serverName: server.name,
          role: isPrimary ? "primary" : "volume",
          command: "bash",
          args: ["-lc", script],
          env: {
            SEAWEEDFS_ROLE: isPrimary ? "primary" : "volume",
            AWS_ACCESS_KEY_ID: "admin",
            AWS_SECRET_ACCESS_KEY: "secret",
            S3_BUCKET: normalizedBucketName,
          },
        } as Prisma.InputJsonValue,
      },
    });

    await enqueueAgentJob({
      agentId: agent.id,
      type: "RunCommand",
      payload: {
        command: "bash",
        args: ["-lc", script],
        env: {
          SEAWEEDFS_ROLE: isPrimary ? "primary" : "volume",
          AWS_ACCESS_KEY_ID: "admin",
          AWS_SECRET_ACCESS_KEY: "secret",
          S3_BUCKET: normalizedBucketName,
        },
      } as Prisma.InputJsonValue,
      resourceId: resource.id,
      deploymentStepId: step.id,
      targetId: null,
    });

    await dispatchQueuedJobsToOnlineAgent(agent.id);

    order += 1;
  }

  return resource;
}

async function loadDeploymentForJob(jobId: string) {
  return prismaClient.agentJob.findUnique({
    where: {
      id: jobId,
    },
    include: {
      deploymentStep: {
        include: {
          deployment: {
            include: {
              resource: true,
              steps: true,
            },
          },
        },
      },
    },
  });
}

function summarizeDeploymentSteps(steps: Array<{ id: string; order: number; name: string; status: string; input?: unknown }>) {
  return steps
    .slice()
    .sort((first, second) => first.order - second.order)
    .map((step) => ({
      id: step.id,
      order: step.order,
      name: step.name,
      status: step.status,
      input: step.input,
    }));
}

function getStepServerId(step: { input: unknown }) {
  const input = step.input as { serverId?: string };
  return typeof input.serverId === "string" ? input.serverId : null;
}

export async function reconcileSeaweedFsDeploymentForJob(jobId: string) {
  const job = await loadDeploymentForJob(jobId);

  if (!job?.deploymentStep?.deployment?.resource || job.deploymentStep.deployment.resource.type !== "jade.storage.bucket") {
    return;
  }

  const deployment = job.deploymentStep.deployment;
  const resource = deployment.resource;
  const stepStatus = job.status === "Succeeded" ? "Succeeded" : job.status === "Failed" || job.status === "Expired" || job.status === "Cancelled" ? "Failed" : null;

  if (stepStatus) {
    await prismaClient.deploymentStep.update({
      where: {
        id: job.deploymentStep.id,
      },
      data: {
        status: stepStatus,
        error: job.lastError,
        output: job.result as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  }

  const refreshedDeployment = await prismaClient.deployment.findUnique({
    where: {
      id: deployment.id,
    },
    include: {
      resource: true,
      steps: {
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!refreshedDeployment?.resource) {
    return;
  }

  const steps = summarizeDeploymentSteps(refreshedDeployment.steps);
  const hadFailure = steps.some((step) => step.status === "Failed");
  const allSucceeded = steps.length > 0 && steps.every((step) => step.status === "Succeeded");
  const bucketSpec = refreshedDeployment.resource.spec as SeaweedFsBucketSpec;
  const primaryHost = bucketSpec.placement.primaryHost;
  const gatewayUrl = `http://${primaryHost}:${bucketSpec.ports.s3}`;
  const masterUrl = `http://${primaryHost}:${bucketSpec.ports.master}`;

  if (hadFailure) {
    const failedStep = steps.find((step) => step.status === "Failed");
    await prismaClient.deployment.update({
      where: {
        id: refreshedDeployment.id,
      },
      data: {
        status: "Failed",
        finishedAt: new Date(),
      },
    });
    await prismaClient.resource.update({
      where: {
        id: refreshedDeployment.resource.id,
      },
      data: {
        phase: "Failed",
        health: "Unhealthy",
        lastError: job.lastError ?? failedStep?.name ?? "SeaweedFS deployment failed",
        status: {
          phase: "Failed",
          deploymentId: refreshedDeployment.id,
          gatewayUrl,
          masterUrl,
          installedServers: steps.filter((step) => step.status === "Succeeded").map((step) => getStepServerId(step)).filter((value): value is string => value !== null),
          failedServers: steps.filter((step) => step.status === "Failed").map((step) => getStepServerId(step)).filter((value): value is string => value !== null),
          lastError: job.lastError ?? failedStep?.name ?? "SeaweedFS deployment failed",
          connection: null,
        } satisfies SeaweedFsBucketStatus,
      },
    });
    return;
  }

  if (!allSucceeded) {
    await prismaClient.deployment.update({
      where: {
        id: refreshedDeployment.id,
      },
      data: {
        status: "Running",
      },
    });
    await prismaClient.resource.update({
      where: {
        id: refreshedDeployment.resource.id,
      },
      data: {
        phase: "Deploying",
        health: "Unknown",
        status: {
          phase: "Deploying",
          deploymentId: refreshedDeployment.id,
          gatewayUrl,
          masterUrl,
          installedServers: steps.filter((step) => step.status === "Succeeded").map((step) => getStepServerId(step)).filter((value): value is string => value !== null),
          failedServers: steps.filter((step) => step.status === "Failed").map((step) => getStepServerId(step)).filter((value): value is string => value !== null),
          lastError: null,
          connection: null,
        } satisfies SeaweedFsBucketStatus,
      },
    });
    return;
  }

  await prismaClient.deployment.update({
    where: {
      id: refreshedDeployment.id,
    },
    data: {
      status: "Succeeded",
      finishedAt: new Date(),
    },
  });

  await prismaClient.resource.update({
    where: {
      id: refreshedDeployment.resource.id,
    },
    data: {
      phase: "Running",
      health: "Healthy",
      lastError: null,
        status: {
        phase: "Running",
        deploymentId: refreshedDeployment.id,
        gatewayUrl,
        masterUrl,
        installedServers: bucketSpec.placement.serverIds,
        failedServers: [],
        lastError: null,
        connection: {
          endpoint: gatewayUrl,
          accessKeyId: bucketSpec.credentials.accessKeyId,
          secretAccessKey: bucketSpec.credentials.secretAccessKey,
          bucket: bucketSpec.bucketName,
        },
      } satisfies SeaweedFsBucketStatus,
    },
  });
}

export type { SeaweedFsBucketSpec, SeaweedFsBucketStatus, RunCommandPayload };
