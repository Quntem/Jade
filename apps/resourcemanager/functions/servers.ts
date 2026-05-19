import { prismaClient } from "@jade/database";

type ServerWithRelations = Awaited<ReturnType<typeof findServers>>[number];

function serializeBigInt(value: bigint | number | null) {
  return typeof value === "bigint" ? value.toString() : value;
}

function serializeServer(server: ServerWithRelations) {
  return {
    ...server,
    memoryBytes: serializeBigInt(server.memoryBytes),
    storageBytes: serializeBigInt(server.storageBytes),
  };
}

function findServers({ scopeIds }: { scopeIds: string[] }) {
  return prismaClient.server.findMany({
    where: {
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
      capabilities: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

function findServerById({ id, scopeIds }: { id: string; scopeIds: string[] }) {
  return prismaClient.server.findFirst({
    where: {
      id,
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
      capabilities: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function getServers({ scopeIds }: { scopeIds: string[] }) {
  if (scopeIds.length === 0) {
    return [];
  }

  const servers = await findServers({ scopeIds });
  return servers.map(serializeServer);
}

export async function getServerById({
  id,
  scopeIds,
}: {
  id: string;
  scopeIds: string[];
}) {
  if (scopeIds.length === 0) {
    return null;
  }

  const server = await findServerById({ id, scopeIds });
  return server ? serializeServer(server) : null;
}
