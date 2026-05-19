-- CreateEnum
CREATE TYPE "VpnHubStatus" AS ENUM ('Unknown', 'Online', 'Offline', 'Degraded');

-- CreateEnum
CREATE TYPE "VpnPeerStatus" AS ENUM ('Pending', 'Ready', 'Delivered', 'Degraded', 'Disabled');

-- CreateEnum
CREATE TYPE "VpnConfigDeliveryStatus" AS ENUM ('Pending', 'Delivered', 'Acknowledged', 'Failed');

-- AlterEnum
ALTER TYPE "AgentJobType" ADD VALUE 'ConfigureVpn';

-- AlterTable
ALTER TABLE "agents" ADD COLUMN "wireguardPublicKey" TEXT;

-- CreateTable
CREATE TABLE "vpn_hubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpointHost" TEXT NOT NULL,
    "endpointPort" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "serviceTokenHash" TEXT NOT NULL,
    "status" "VpnHubStatus" NOT NULL DEFAULT 'Unknown',
    "lastSeenAt" TIMESTAMP(3),
    "desiredStateVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vpn_hubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_peers" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "tunnelIp" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "status" "VpnPeerStatus" NOT NULL DEFAULT 'Pending',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastConfigRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vpn_peers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_config_revisions" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "desiredStateVersion" INTEGER NOT NULL,
    "renderedConfig" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "deliveryStatus" "VpnConfigDeliveryStatus" NOT NULL DEFAULT 'Pending',
    "agentJobId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vpn_config_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_routes" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vpn_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vpn_hubs_serviceTokenHash_key" ON "vpn_hubs"("serviceTokenHash");

-- CreateIndex
CREATE INDEX "vpn_hubs_status_idx" ON "vpn_hubs"("status");

-- CreateIndex
CREATE INDEX "vpn_hubs_deletedAt_idx" ON "vpn_hubs"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_peers_tunnelIp_key" ON "vpn_peers"("tunnelIp");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_peers_serverId_hubId_key" ON "vpn_peers"("serverId", "hubId");

-- CreateIndex
CREATE INDEX "vpn_peers_serverId_idx" ON "vpn_peers"("serverId");

-- CreateIndex
CREATE INDEX "vpn_peers_hubId_idx" ON "vpn_peers"("hubId");

-- CreateIndex
CREATE INDEX "vpn_peers_status_idx" ON "vpn_peers"("status");

-- CreateIndex
CREATE INDEX "vpn_peers_enabled_idx" ON "vpn_peers"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_config_revisions_peerId_revision_key" ON "vpn_config_revisions"("peerId", "revision");

-- CreateIndex
CREATE INDEX "vpn_config_revisions_hubId_idx" ON "vpn_config_revisions"("hubId");

-- CreateIndex
CREATE INDEX "vpn_config_revisions_deliveryStatus_idx" ON "vpn_config_revisions"("deliveryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_routes_peerId_cidr_key" ON "vpn_routes"("peerId", "cidr");

-- CreateIndex
CREATE INDEX "vpn_routes_cidr_idx" ON "vpn_routes"("cidr");

-- CreateIndex
CREATE INDEX "vpn_routes_enabled_idx" ON "vpn_routes"("enabled");

-- AddForeignKey
ALTER TABLE "vpn_peers" ADD CONSTRAINT "vpn_peers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_peers" ADD CONSTRAINT "vpn_peers_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "vpn_hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_config_revisions" ADD CONSTRAINT "vpn_config_revisions_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "vpn_peers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_config_revisions" ADD CONSTRAINT "vpn_config_revisions_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "vpn_hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_routes" ADD CONSTRAINT "vpn_routes_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "vpn_peers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
