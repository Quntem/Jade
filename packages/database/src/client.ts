import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

type CreatePrismaClientOptions = {
  connectionString?: string;
};

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize Prisma");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

export const prismaClient = globalForPrisma.prisma ?? createPrismaClient();

export const db = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}
