import { prismaClient } from "@jade/database";
import type { ResourceScope } from "../../../packages/database/src/generated/prisma/client";
import type { ScopeType } from "../../../packages/database/src/generated/prisma/enums";

export async function getScopes({
  ownerIds,
  tenantOrganizationId,
}: {
  ownerIds: string[];
  tenantOrganizationId: string;
}) {
  const scopesById = new Map<string, ResourceScope>();
  const directlyVisibleScopes = await prismaClient.resourceScope.findMany({
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

  for (const scope of directlyVisibleScopes) {
    scopesById.set(scope.id, scope);
  }

  let parentIds = [tenantOrganizationId];

  while (parentIds.length > 0) {
    const children = await prismaClient.resourceScope.findMany({
      where: {
        parentId: {
          in: parentIds,
        },
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    parentIds = children
      .filter((scope) => !scopesById.has(scope.id))
      .map((scope) => scope.id);

    for (const scope of children) {
      scopesById.set(scope.id, scope);
    }
  }

  return [...scopesById.values()].sort(
    (first, second) => first.createdAt.getTime() - second.createdAt.getTime()
  );
}

export async function getScopeById({
  id,
  ownerIds,
  tenantOrganizationId,
}: {
  id: string;
  ownerIds: string[];
  tenantOrganizationId: string;
}) {
  const directlyVisibleScope = await prismaClient.resourceScope.findFirst({
    where: {
      id,
      ownerId: {
        in: ownerIds,
      },
      deletedAt: null,
    },
  });

  if (directlyVisibleScope) {
    return directlyVisibleScope;
  }

  const scope = await prismaClient.resourceScope.findFirst({
    where: {
      id,
      deletedAt: null,
    },
  });

  if (!scope) {
    return null;
  }

  if (await isDescendantOfScope({ scope, ancestorId: tenantOrganizationId })) {
    return scope;
  }

  return null;
}

export async function isDescendantOfScope({
  scope,
  ancestorId,
}: {
  scope: ResourceScope;
  ancestorId: string;
}) {
  let parentId = scope.parentId;
  const seenScopeIds = new Set<string>([scope.id]);

  while (parentId) {
    if (parentId === ancestorId) {
      return true;
    }

    if (seenScopeIds.has(parentId)) {
      return false;
    }

    seenScopeIds.add(parentId);

    const parent = await prismaClient.resourceScope.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
      },
    });

    parentId = parent?.parentId ?? null;
  }

  return false;
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

export async function createScope({ ownerId, name, description, type, parentId }: { ownerId: string; name: string; description?: string | null; type: ScopeType; parentId: string }) {
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
