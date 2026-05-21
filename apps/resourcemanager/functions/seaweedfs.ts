import { Prisma, prismaClient } from "@jade/database";
import { enqueueAgentJob } from "./agentJobs";

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
  agents: Array<{ id: string; deletedAt: Date | null; createdAt: Date }>;
}) {
  return server.agents
    .filter((agent) => agent.deletedAt === null)
    .sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime())[0];
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
  const binDir = "$HOME/.jade/bin";

  return [
    "set -euo pipefail",
    `mkdir -p "${binDir}" "${dataDir}/logs" "${dataDir}/data"`,
    "if ! command -v weed >/dev/null 2>&1; then",
    "  if command -v go >/dev/null 2>&1; then",
    `    GOBIN="${binDir}" go install github.com/seaweedfs/seaweedfs/weed@latest`,
    "  else",
    '    echo "SeaweedFS is not installed and Go is unavailable" >&2',
    "    exit 1",
    "  fi",
    "fi",
    'export PATH="$HOME/.jade/bin:$PATH"',
    'WEED_BIN="$(command -v weed)"',
    `PRIMARY_HOST="${primaryHost}"`,
    `OWN_HOST="${ownHost}"`,
    `BUCKET_NAME="${bucketName}"`,
    'MASTER_LOG="${HOME}/.jade/seaweedfs/logs/master.log"',
    'FILER_LOG="${HOME}/.jade/seaweedfs/logs/filer.log"',
    'S3_LOG="${HOME}/.jade/seaweedfs/logs/s3.log"',
    'VOLUME_LOG="${HOME}/.jade/seaweedfs/logs/volume.log"',
    'if [ "${SEAWEEDFS_ROLE:-}" = "primary" ]; then',
    '  nohup "$WEED_BIN" server -dir="${HOME}/.jade/seaweedfs/data" -ip="$OWN_HOST" -s3 > "$MASTER_LOG" 2>&1 &',
    "  sleep 3",
    "else",
    '  nohup "$WEED_BIN" volume -dir="${HOME}/.jade/seaweedfs/data" -master="${PRIMARY_HOST}:9333" -ip="$OWN_HOST" > "$VOLUME_LOG" 2>&1 &',
    "fi",
    "sleep 2",
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
      binaryName: "weed",
      packageSource: "github.com/seaweedfs/seaweedfs/weed@latest",
    },
  };
}

export async function createSeaweedFsBucketResource({
  scopeId,
  createdBy,
  name,
  bucketName,
  serverIds,
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

  const primaryServer = visibleServers[0];

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
      throw new Error(`Server ${server.name} does not have a connected agent`);
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
