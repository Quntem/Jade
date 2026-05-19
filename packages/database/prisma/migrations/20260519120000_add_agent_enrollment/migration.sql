-- CreateTable
CREATE TABLE "enrollment_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_credentials" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_tokens_tokenHash_key" ON "enrollment_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "enrollment_tokens_scopeId_idx" ON "enrollment_tokens"("scopeId");

-- CreateIndex
CREATE INDEX "enrollment_tokens_expiresAt_idx" ON "enrollment_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "enrollment_tokens_usedAt_idx" ON "enrollment_tokens"("usedAt");

-- CreateIndex
CREATE INDEX "enrollment_tokens_revokedAt_idx" ON "enrollment_tokens"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_credentials_tokenHash_key" ON "agent_credentials"("tokenHash");

-- CreateIndex
CREATE INDEX "agent_credentials_agentId_idx" ON "agent_credentials"("agentId");

-- CreateIndex
CREATE INDEX "agent_credentials_revokedAt_idx" ON "agent_credentials"("revokedAt");

-- AddForeignKey
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "resource_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
