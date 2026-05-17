-- CreateEnum
CREATE TYPE "ResourcePhase" AS ENUM ('Pending', 'Planning', 'Scheduled', 'Deploying', 'Running', 'Degraded', 'Failed', 'Deleting', 'Deleted');

-- CreateEnum
CREATE TYPE "ResourceHealth" AS ENUM ('Unknown', 'Healthy', 'Warning', 'Unhealthy');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('Organization', 'Project', 'ResourceGroup', 'Folder', 'System');

-- CreateEnum
CREATE TYPE "DeploymentTargetKind" AS ENUM ('Server', 'ServerGroup', 'KubernetesCluster', 'External');

-- CreateEnum
CREATE TYPE "TargetStatus" AS ENUM ('Unknown', 'Online', 'Offline', 'Degraded', 'Maintenance');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('Unknown', 'Online', 'Offline', 'Degraded', 'Maintenance');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('Unknown', 'Online', 'Offline', 'Degraded');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('Queued', 'Planning', 'Running', 'Succeeded', 'Failed', 'Cancelled', 'RolledBack');

-- CreateEnum
CREATE TYPE "DeploymentStepStatus" AS ENUM ('Pending', 'Running', 'Succeeded', 'Failed', 'Skipped', 'RolledBack');

-- CreateEnum
CREATE TYPE "AgentJobType" AS ENUM ('ApplyResource', 'DestroyResource', 'ObserveResource', 'ReconcileResource', 'RunCommand');

-- CreateEnum
CREATE TYPE "AgentJobStatus" AS ENUM ('Queued', 'Leased', 'Running', 'Succeeded', 'Failed', 'Cancelled', 'Expired');

-- CreateEnum
CREATE TYPE "ResourceEventType" AS ENUM ('Created', 'Updated', 'Deleted', 'PhaseChanged', 'HealthChanged', 'Scheduled', 'DeploymentStarted', 'DeploymentSucceeded', 'DeploymentFailed', 'DriftDetected', 'Reconciled', 'Error');

-- CreateEnum
CREATE TYPE "ResourceDependencyKind" AS ENUM ('DependsOn', 'Owns', 'Uses', 'Exposes', 'Requires');

-- CreateEnum
CREATE TYPE "ResourceLockKind" AS ENUM ('Deployment', 'Reconciliation', 'Deletion', 'Manual');

-- CreateEnum
CREATE TYPE "SecretKind" AS ENUM ('Opaque', 'Token', 'Password', 'Certificate', 'SshKey', 'Kubeconfig');

-- CreateTable
CREATE TABLE "resource_scopes" (
    "id" TEXT NOT NULL,
    "type" "ScopeType" NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "ownerId" TEXT,
    "defaultProvider" TEXT,
    "defaultTargetId" TEXT,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "resource_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "status" JSONB NOT NULL DEFAULT '{}',
    "desiredVersion" INTEGER NOT NULL DEFAULT 1,
    "observedVersion" INTEGER NOT NULL DEFAULT 0,
    "phase" "ResourcePhase" NOT NULL DEFAULT 'Pending',
    "health" "ResourceHealth" NOT NULL DEFAULT 'Unknown',
    "provider" TEXT,
    "targetId" TEXT,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_targets" (
    "id" TEXT NOT NULL,
    "kind" "DeploymentTargetKind" NOT NULL,
    "name" TEXT NOT NULL,
    "scopeId" TEXT,
    "provider" TEXT,
    "status" "TargetStatus" NOT NULL DEFAULT 'Unknown',
    "serverId" TEXT,
    "serverGroupId" TEXT,
    "kubernetesClusterId" TEXT,
    "endpoint" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "deployment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeId" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'Unknown',
    "hostname" TEXT,
    "os" TEXT,
    "arch" TEXT,
    "cpuCores" INTEGER,
    "memoryBytes" BIGINT,
    "storageBytes" BIGINT,
    "lastSeenAt" TIMESTAMP(3),
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'Unknown',
    "lastSeenAt" TIMESTAMP(3),
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_capabilities" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeId" TEXT,
    "schedulingPolicy" JSONB NOT NULL DEFAULT '{}',
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "server_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_group_members" (
    "id" TEXT NOT NULL,
    "serverGroupId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "role" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kubernetes_clusters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeId" TEXT,
    "distribution" TEXT,
    "version" TEXT,
    "endpoint" TEXT,
    "status" "TargetStatus" NOT NULL DEFAULT 'Unknown',
    "kubeconfigSecretId" TEXT,
    "provider" TEXT,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kubernetes_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kubernetes_cluster_nodes" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "nodeName" TEXT,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "annotations" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kubernetes_cluster_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT,
    "resourceId" TEXT,
    "targetId" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'Queued',
    "desiredVersion" INTEGER,
    "plan" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_steps" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "resourceId" TEXT,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "provider" TEXT,
    "targetId" TEXT,
    "status" "DeploymentStepStatus" NOT NULL DEFAULT 'Pending',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployment_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_jobs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "targetId" TEXT,
    "resourceId" TEXT,
    "deploymentStepId" TEXT,
    "type" "AgentJobType" NOT NULL,
    "status" "AgentJobStatus" NOT NULL DEFAULT 'Queued',
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "leaseOwner" TEXT,
    "leasedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_events" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "type" "ResourceEventType" NOT NULL,
    "message" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_dependencies" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "kind" "ResourceDependencyKind" NOT NULL DEFAULT 'DependsOn',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_locks" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "kind" "ResourceLockKind" NOT NULL,
    "owner" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secrets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeId" TEXT,
    "resourceId" TEXT,
    "kind" "SecretKind" NOT NULL DEFAULT 'Opaque',
    "ciphertext" BYTEA,
    "externalRef" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "resourceName" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_scopes_type_idx" ON "resource_scopes"("type");

-- CreateIndex
CREATE INDEX "resource_scopes_parentId_idx" ON "resource_scopes"("parentId");

-- CreateIndex
CREATE INDEX "resource_scopes_ownerId_idx" ON "resource_scopes"("ownerId");

-- CreateIndex
CREATE INDEX "resources_scopeId_idx" ON "resources"("scopeId");

-- CreateIndex
CREATE INDEX "resources_type_idx" ON "resources"("type");

-- CreateIndex
CREATE INDEX "resources_phase_idx" ON "resources"("phase");

-- CreateIndex
CREATE INDEX "resources_health_idx" ON "resources"("health");

-- CreateIndex
CREATE INDEX "resources_provider_idx" ON "resources"("provider");

-- CreateIndex
CREATE INDEX "resources_targetId_idx" ON "resources"("targetId");

-- CreateIndex
CREATE INDEX "resources_createdAt_idx" ON "resources"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "resources_scopeId_type_name_key" ON "resources"("scopeId", "type", "name");

-- CreateIndex
CREATE INDEX "deployment_targets_kind_idx" ON "deployment_targets"("kind");

-- CreateIndex
CREATE INDEX "deployment_targets_scopeId_idx" ON "deployment_targets"("scopeId");

-- CreateIndex
CREATE INDEX "deployment_targets_provider_idx" ON "deployment_targets"("provider");

-- CreateIndex
CREATE INDEX "deployment_targets_status_idx" ON "deployment_targets"("status");

-- CreateIndex
CREATE INDEX "deployment_targets_serverId_idx" ON "deployment_targets"("serverId");

-- CreateIndex
CREATE INDEX "deployment_targets_serverGroupId_idx" ON "deployment_targets"("serverGroupId");

-- CreateIndex
CREATE INDEX "deployment_targets_kubernetesClusterId_idx" ON "deployment_targets"("kubernetesClusterId");

-- CreateIndex
CREATE INDEX "servers_scopeId_idx" ON "servers"("scopeId");

-- CreateIndex
CREATE INDEX "servers_status_idx" ON "servers"("status");

-- CreateIndex
CREATE INDEX "servers_hostname_idx" ON "servers"("hostname");

-- CreateIndex
CREATE INDEX "agents_serverId_idx" ON "agents"("serverId");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agents_lastSeenAt_idx" ON "agents"("lastSeenAt");

-- CreateIndex
CREATE INDEX "server_capabilities_type_idx" ON "server_capabilities"("type");

-- CreateIndex
CREATE INDEX "server_capabilities_provider_idx" ON "server_capabilities"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "server_capabilities_serverId_type_provider_key" ON "server_capabilities"("serverId", "type", "provider");

-- CreateIndex
CREATE INDEX "server_groups_scopeId_idx" ON "server_groups"("scopeId");

-- CreateIndex
CREATE INDEX "server_group_members_serverId_idx" ON "server_group_members"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "server_group_members_serverGroupId_serverId_key" ON "server_group_members"("serverGroupId", "serverId");

-- CreateIndex
CREATE INDEX "kubernetes_clusters_scopeId_idx" ON "kubernetes_clusters"("scopeId");

-- CreateIndex
CREATE INDEX "kubernetes_clusters_status_idx" ON "kubernetes_clusters"("status");

-- CreateIndex
CREATE INDEX "kubernetes_clusters_provider_idx" ON "kubernetes_clusters"("provider");

-- CreateIndex
CREATE INDEX "kubernetes_cluster_nodes_serverId_idx" ON "kubernetes_cluster_nodes"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "kubernetes_cluster_nodes_clusterId_serverId_key" ON "kubernetes_cluster_nodes"("clusterId", "serverId");

-- CreateIndex
CREATE INDEX "deployments_scopeId_idx" ON "deployments"("scopeId");

-- CreateIndex
CREATE INDEX "deployments_resourceId_idx" ON "deployments"("resourceId");

-- CreateIndex
CREATE INDEX "deployments_targetId_idx" ON "deployments"("targetId");

-- CreateIndex
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

-- CreateIndex
CREATE INDEX "deployments_createdAt_idx" ON "deployments"("createdAt");

-- CreateIndex
CREATE INDEX "deployment_steps_resourceId_idx" ON "deployment_steps"("resourceId");

-- CreateIndex
CREATE INDEX "deployment_steps_status_idx" ON "deployment_steps"("status");

-- CreateIndex
CREATE INDEX "deployment_steps_targetId_idx" ON "deployment_steps"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_steps_deploymentId_order_key" ON "deployment_steps"("deploymentId", "order");

-- CreateIndex
CREATE INDEX "agent_jobs_agentId_idx" ON "agent_jobs"("agentId");

-- CreateIndex
CREATE INDEX "agent_jobs_targetId_idx" ON "agent_jobs"("targetId");

-- CreateIndex
CREATE INDEX "agent_jobs_resourceId_idx" ON "agent_jobs"("resourceId");

-- CreateIndex
CREATE INDEX "agent_jobs_deploymentStepId_idx" ON "agent_jobs"("deploymentStepId");

-- CreateIndex
CREATE INDEX "agent_jobs_status_idx" ON "agent_jobs"("status");

-- CreateIndex
CREATE INDEX "agent_jobs_type_idx" ON "agent_jobs"("type");

-- CreateIndex
CREATE INDEX "agent_jobs_leaseExpiresAt_idx" ON "agent_jobs"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "resource_events_resourceId_idx" ON "resource_events"("resourceId");

-- CreateIndex
CREATE INDEX "resource_events_deploymentId_idx" ON "resource_events"("deploymentId");

-- CreateIndex
CREATE INDEX "resource_events_type_idx" ON "resource_events"("type");

-- CreateIndex
CREATE INDEX "resource_events_createdAt_idx" ON "resource_events"("createdAt");

-- CreateIndex
CREATE INDEX "resource_dependencies_dependsOnId_idx" ON "resource_dependencies"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_dependencies_resourceId_dependsOnId_kind_key" ON "resource_dependencies"("resourceId", "dependsOnId", "kind");

-- CreateIndex
CREATE INDEX "resource_locks_expiresAt_idx" ON "resource_locks"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "resource_locks_resourceId_kind_key" ON "resource_locks"("resourceId", "kind");

-- CreateIndex
CREATE INDEX "secrets_scopeId_idx" ON "secrets"("scopeId");

-- CreateIndex
CREATE INDEX "secrets_resourceId_idx" ON "secrets"("resourceId");

-- CreateIndex
CREATE INDEX "secrets_kind_idx" ON "secrets"("kind");

-- CreateIndex
CREATE INDEX "audit_logs_scopeId_idx" ON "audit_logs"("scopeId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resourceId_idx" ON "audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "resource_scopes" ADD CONSTRAINT "resource_scopes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "resource_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "deployment_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_serverGroupId_fkey" FOREIGN KEY ("serverGroupId") REFERENCES "server_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_kubernetesClusterId_fkey" FOREIGN KEY ("kubernetesClusterId") REFERENCES "kubernetes_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_capabilities" ADD CONSTRAINT "server_capabilities_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_group_members" ADD CONSTRAINT "server_group_members_serverGroupId_fkey" FOREIGN KEY ("serverGroupId") REFERENCES "server_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_group_members" ADD CONSTRAINT "server_group_members_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kubernetes_cluster_nodes" ADD CONSTRAINT "kubernetes_cluster_nodes_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "kubernetes_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kubernetes_cluster_nodes" ADD CONSTRAINT "kubernetes_cluster_nodes_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "deployment_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_steps" ADD CONSTRAINT "deployment_steps_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_steps" ADD CONSTRAINT "deployment_steps_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "deployment_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_deploymentStepId_fkey" FOREIGN KEY ("deploymentStepId") REFERENCES "deployment_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_events" ADD CONSTRAINT "resource_events_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_events" ADD CONSTRAINT "resource_events_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_dependencies" ADD CONSTRAINT "resource_dependencies_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_dependencies" ADD CONSTRAINT "resource_dependencies_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_locks" ADD CONSTRAINT "resource_locks_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
