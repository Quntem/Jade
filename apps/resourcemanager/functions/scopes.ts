import { prismaClient } from "@jade/database";
import type { ScopeType } from "../../../packages/database/src/generated/prisma/enums";

export async function getScopes({ ownerIds }: { ownerIds: string[] }) {
  return await prismaClient.resourceScope.findMany({
    where: {
      ownerId: {
        in: ownerIds,
      },
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getScopeById({ id, ownerIds }: { id: string; ownerIds: string[] }) {
  return await prismaClient.resourceScope.findFirst({
    where: {
      id,
      ownerId: {
        in: ownerIds,
      },
      deletedAt: null,
    },
  });
}

export async function ensureTenantOrganizationScope({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const existingScope = await prismaClient.resourceScope.findFirst({
    where: {
      type: "Organization",
      ownerId: tenantId,
      deletedAt: null,
    },
  });

  if (existingScope) {
    if (existingScope.name !== tenantName) {
      return await prismaClient.resourceScope.update({
        where: {
          id: existingScope.id,
        },
        data: {
          name: tenantName,
        },
      });
    }

    return existingScope;
  }

  return await prismaClient.resourceScope.create({
    data: {
      ownerId: tenantId,
      name: tenantName,
      type: "Organization",
      description: null,
    },
  });
}

export async function ensureUserScope({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const existingScope = await prismaClient.resourceScope.findFirst({
    where: {
      type: "User",
      ownerId: userId,
      deletedAt: null,
    },
  });

  if (existingScope) {
    const needsUpdate =
      existingScope.name !== userName || existingScope.parentId !== null;

    if (needsUpdate) {
      return await prismaClient.resourceScope.update({
        where: {
          id: existingScope.id,
        },
        data: {
          name: userName,
          parentId: null,
        },
      });
    }

    return existingScope;
  }

  return await prismaClient.resourceScope.create({
    data: {
      ownerId: userId,
      name: userName,
      type: "User",
      description: null,
      parentId: null,
    },
  });
}

export async function createScope({ ownerId, name, description, type, parentId }: { ownerId: string; name: string; description: string; type: ScopeType; parentId?: string | null }) {
  return await prismaClient.resourceScope.create({
    data: {
      ownerId,
      name,
      description,
      type,
      parentId,
    },
  });
}
