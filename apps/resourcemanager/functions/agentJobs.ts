import { Prisma, prismaClient } from "@jade/database";
import type { AgentJobStatus, AgentJobType } from "../../../packages/database/src/generated/prisma/enums";

const DEFAULT_AGENT_JOB_LEASE_MS = 5 * 60 * 1000;

type EnqueueAgentJobOptions = {
  agentId: string;
  type: AgentJobType;
  payload: Prisma.InputJsonValue;
  targetId?: string | null;
  resourceId?: string | null;
  deploymentStepId?: string | null;
  maxAttempts?: number;
};

type CompleteAgentJobOptions = {
  agentId: string;
  jobId: string;
  result?: Prisma.InputJsonValue;
};

type FailAgentJobOptions = {
  agentId: string;
  jobId: string;
  error?: string;
  result?: Prisma.InputJsonValue;
};

type JobProgressOptions = {
  agentId: string;
  jobId: string;
  result?: Prisma.InputJsonValue;
};

function getJobLeaseMs() {
  const configuredLeaseMs = Number(process.env.AGENT_JOB_LEASE_MS);

  if (!Number.isFinite(configuredLeaseMs) || configuredLeaseMs <= 0) {
    return DEFAULT_AGENT_JOB_LEASE_MS;
  }

  return configuredLeaseMs;
}

function createLeaseExpiration() {
  return new Date(Date.now() + getJobLeaseMs());
}

function jsonOrEmptyObject(value: Prisma.InputJsonValue | undefined) {
  return value === undefined ? {} : value;
}

function normalizeMaxAttempts(maxAttempts: number | undefined) {
  if (typeof maxAttempts !== "number" || !Number.isFinite(maxAttempts)) {
    return 3;
  }

  return Math.max(1, Math.floor(maxAttempts));
}

export async function enqueueAgentJob({
  agentId,
  type,
  payload,
  targetId = null,
  resourceId = null,
  deploymentStepId = null,
  maxAttempts,
}: EnqueueAgentJobOptions) {
  return await prismaClient.agentJob.create({
    data: {
      agentId,
      type,
      payload,
      targetId,
      resourceId,
      deploymentStepId,
      maxAttempts: normalizeMaxAttempts(maxAttempts),
    },
  });
}

export async function expireLeasedJobs() {
  const now = new Date();
  const expiredJobs = await prismaClient.agentJob.findMany({
    where: {
      status: {
        in: ["Leased", "Running"],
      },
      leaseExpiresAt: {
        lte: now,
      },
    },
    select: {
      id: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  for (const job of expiredJobs) {
    const canRetry = job.attempts < job.maxAttempts;

    await prismaClient.agentJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: canRetry ? "Queued" : "Expired",
        leaseOwner: null,
        leasedAt: null,
        leaseExpiresAt: null,
        lastError: "Job lease expired",
        ...(canRetry ? {} : { finishedAt: now }),
      },
    });
  }
}

export async function leaseQueuedJobsForAgent({
  agentId,
  limit = 10,
}: {
  agentId: string;
  limit?: number;
}) {
  await expireLeasedJobs();

  const jobs = await prismaClient.agentJob.findMany({
    where: {
      agentId,
      status: "Queued",
    },
    orderBy: {
      createdAt: "asc",
    },
    take: Math.max(1, limit),
  });
  const now = new Date();
  const leaseExpiresAt = createLeaseExpiration();
  const leasedJobs = [];

  for (const job of jobs) {
    const lease = await prismaClient.agentJob.updateMany({
      where: {
        id: job.id,
        status: "Queued",
      },
      data: {
        status: "Leased",
        leaseOwner: agentId,
        leasedAt: now,
        leaseExpiresAt,
        attempts: {
          increment: 1,
        },
      },
    });

    if (lease.count !== 1) {
      continue;
    }

    const leasedJob = await prismaClient.agentJob.findUnique({
      where: {
        id: job.id,
      },
    });

    if (leasedJob) {
      leasedJobs.push(leasedJob);
    }
  }

  return leasedJobs;
}

export async function markJobAccepted({
  agentId,
  jobId,
}: {
  agentId: string;
  jobId: string;
}) {
  const now = new Date();

  return await updateOwnedJob({
    agentId,
    jobId,
    from: ["Leased", "Queued"],
    data: {
      status: "Running",
      leaseOwner: agentId,
      leasedAt: now,
      leaseExpiresAt: createLeaseExpiration(),
      startedAt: now,
      lastError: null,
    },
  });
}

export async function recordJobProgress({
  agentId,
  jobId,
  result,
}: JobProgressOptions) {
  return await updateOwnedJob({
    agentId,
    jobId,
    from: ["Running", "Leased"],
    data: {
      status: "Running",
      result: jsonOrEmptyObject(result),
      leaseExpiresAt: createLeaseExpiration(),
    },
  });
}

export async function completeAgentJob({
  agentId,
  jobId,
  result,
}: CompleteAgentJobOptions) {
  return await updateOwnedJob({
    agentId,
    jobId,
    from: ["Running", "Leased"],
    data: {
      status: "Succeeded",
      result: jsonOrEmptyObject(result),
      leaseOwner: null,
      leaseExpiresAt: null,
      finishedAt: new Date(),
      lastError: null,
    },
  });
}

export async function failAgentJob({
  agentId,
  jobId,
  error,
  result,
}: FailAgentJobOptions) {
  const job = await prismaClient.agentJob.findFirst({
    where: {
      id: jobId,
      agentId,
      status: {
        in: ["Running", "Leased"],
      },
    },
    select: {
      attempts: true,
      maxAttempts: true,
    },
  });

  if (!job) {
    return null;
  }

  const canRetry = job.attempts < job.maxAttempts;

  return await updateOwnedJob({
    agentId,
    jobId,
    from: ["Running", "Leased"],
    data: {
      status: canRetry ? "Queued" : "Failed",
      result: jsonOrEmptyObject(result),
      leaseOwner: null,
      leasedAt: null,
      leaseExpiresAt: null,
      lastError: error?.trim() || "Agent job failed",
      ...(canRetry ? {} : { finishedAt: new Date() }),
    },
  });
}

async function updateOwnedJob({
  agentId,
  jobId,
  from,
  data,
}: {
  agentId: string;
  jobId: string;
  from: AgentJobStatus[];
  data: Prisma.AgentJobUpdateInput;
}) {
  const update = await prismaClient.agentJob.updateMany({
    where: {
      id: jobId,
      agentId,
      status: {
        in: from,
      },
    },
    data,
  });

  if (update.count !== 1) {
    return null;
  }

  return await prismaClient.agentJob.findUnique({
    where: {
      id: jobId,
    },
  });
}
