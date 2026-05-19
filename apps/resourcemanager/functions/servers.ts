import { prismaClient } from "@jade/database";

export function getServers() {
  return prismaClient.server.findMany();
}
