import { prismaClient } from "@jade/database";
import type { ScopeType } from "../../../packages/database/src/generated/prisma/enums";

export async function getScopes({ ownerId }: { ownerId: string }) {
  return await prismaClient.resourceScope.findMany({
    where: {
      ownerId,
    },
  });
}

export async function getScopeById({ id }: { id: string }) {
  return await prismaClient.resourceScope.findUnique({
    where: {
      id,
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
