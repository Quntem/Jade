import { Prisma, prismaClient } from "@jade/database";
import { createSeaweedFsBucketResource } from "./seaweedfs";

type ListResourcesOptions = {
  scopeIds: string[];
  type?: string | null;
  includeDeleted?: boolean;
};

type CreateResourceOptions = {
  scopeId: string;
  type: string;
  name: string;
  spec: Prisma.InputJsonValue;
  createdBy: string;
  scopeIds: string[];
};

type UpdateResourceOptions = {
  id: string;
  scopeIds: string[];
  input: {
    type?: string;
    name?: string;
    scopeId?: string;
    spec?: Prisma.InputJsonValue;
    status?: Prisma.InputJsonValue;
    desiredVersion?: number;
    observedVersion?: number;
    phase?: "Pending" | "Planning" | "Scheduled" | "Deploying" | "Running" | "Degraded" | "Failed" | "Deleting" | "Deleted";
    health?: "Unknown" | "Healthy" | "Warning" | "Unhealthy";
    provider?: string | null;
    targetId?: string | null;
    labels?: Prisma.InputJsonValue;
    annotations?: Prisma.InputJsonValue;
    createdBy?: string | null;
    lastError?: string | null;
    deletedAt?: string | null;
  };
};

function resourceSelect() {
  return {
    id: true,
    type: true,
    name: true,
    scopeId: true,
    spec: true,
    status: true,
    desiredVersion: true,
    observedVersion: true,
    phase: true,
    health: true,
    provider: true,
    targetId: true,
    labels: true,
    annotations: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    lastError: true,
  } as const;
}

export async function listResources({
  scopeIds,
  type,
  includeDeleted = false,
}: ListResourcesOptions) {
  if (scopeIds.length === 0) {
    return [];
  }

  return await prismaClient.resource.findMany({
    where: {
      scopeId: {
        in: scopeIds,
      },
      ...(type ? { type } : {}),
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: resourceSelect(),
  });
}

export async function getResourceById({
  id,
  scopeIds,
}: {
  id: string;
  scopeIds: string[];
}) {
  if (scopeIds.length === 0) {
    return null;
  }

  return await prismaClient.resource.findFirst({
    where: {
      id,
      scopeId: {
        in: scopeIds,
      },
      deletedAt: null,
    },
    select: resourceSelect(),
  });
}

export async function createResource({
  scopeId,
  type,
  name,
  spec,
  createdBy,
  scopeIds,
}: CreateResourceOptions) {
  if (!scopeIds.includes(scopeId)) {
    throw new Error("Scope is not visible");
  }

  if (type === "jade.storage.bucket") {
    const bucketSpec = spec as {
      bucketName?: string;
      serverIds?: string[];
      primaryServerId?: string;
    };

    if (!bucketSpec.bucketName || !Array.isArray(bucketSpec.serverIds)) {
      throw new Error("Bucket resources require bucketName and serverIds");
    }

    return await createSeaweedFsBucketResource({
      scopeId,
      createdBy,
      name,
      bucketName: bucketSpec.bucketName,
      serverIds: bucketSpec.serverIds,
      primaryServerId: bucketSpec.primaryServerId,
      scopeIds,
    });
  }

  return await prismaClient.resource.create({
    data: {
      scopeId,
      type,
      name,
      spec,
      createdBy,
    },
    select: resourceSelect(),
  });
}

export async function updateResource({
  id,
  scopeIds,
  input,
}: UpdateResourceOptions) {
  const resource = await getResourceById({
    id,
    scopeIds,
  });

  if (!resource) {
    throw new Error("Resource not found");
  }

  return await prismaClient.resource.update({
    where: {
      id,
    },
    data: {
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.scopeId === undefined ? {} : { scopeId: input.scopeId }),
      ...(input.spec === undefined ? {} : { spec: input.spec }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.desiredVersion === undefined ? {} : { desiredVersion: input.desiredVersion }),
      ...(input.observedVersion === undefined ? {} : { observedVersion: input.observedVersion }),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
      ...(input.health === undefined ? {} : { health: input.health }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      ...(input.labels === undefined ? {} : { labels: input.labels }),
      ...(input.annotations === undefined ? {} : { annotations: input.annotations }),
      ...(input.createdBy === undefined ? {} : { createdBy: input.createdBy }),
      ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
      ...(input.deletedAt === undefined
        ? {}
        : { deletedAt: input.deletedAt ? new Date(input.deletedAt) : null }),
    },
    select: resourceSelect(),
  });
}
