-- CreateEnum
CREATE TYPE "VpnClientStatus" AS ENUM ('Pending', 'Ready', 'Delivered', 'Degraded', 'Disabled');

-- CreateTable
CREATE TABLE "vpn_clients" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tunnelIp" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "status" "VpnClientStatus" NOT NULL DEFAULT 'Ready',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vpn_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vpn_clients_tunnelIp_key" ON "vpn_clients"("tunnelIp");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_clients_publicKey_key" ON "vpn_clients"("publicKey");

-- CreateIndex
CREATE INDEX "vpn_clients_scopeId_idx" ON "vpn_clients"("scopeId");

-- CreateIndex
CREATE INDEX "vpn_clients_hubId_idx" ON "vpn_clients"("hubId");

-- CreateIndex
CREATE INDEX "vpn_clients_status_idx" ON "vpn_clients"("status");

-- CreateIndex
CREATE INDEX "vpn_clients_enabled_idx" ON "vpn_clients"("enabled");

-- CreateIndex
CREATE INDEX "vpn_clients_deletedAt_idx" ON "vpn_clients"("deletedAt");

-- AddForeignKey
ALTER TABLE "vpn_clients" ADD CONSTRAINT "vpn_clients_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_clients" ADD CONSTRAINT "vpn_clients_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "vpn_hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
