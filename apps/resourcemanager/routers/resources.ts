import express from "express";
import { Prisma } from "@jade/database";
import { createResource, getResourceById, listResources, updateResource } from "../functions/resources";
import {
  ensureDefaultScopes,
  getSession,
  getVisibleScopeById,
  visibleScopeOwnerIds,
} from "../lib/session";
import { getScopes } from "../functions/scopes";

const router = express.Router();

async function getVisibleScopeIds(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const { tenantOrganization } = await ensureDefaultScopes(session);
  const scopes = await getScopes({
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });

  return scopes.map((scope) => scope.id);
}

router.get("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const requestedScopeId = typeof req.query.scopeId === "string" ? req.query.scopeId.trim() : "";
  const requestedType = typeof req.query.type === "string" ? req.query.type.trim() : "";
  const includeDeleted = req.query.includeDeleted === "true";
  const requestedScope = requestedScopeId
    ? await getVisibleScopeById({
        session,
        scopeId: requestedScopeId,
      })
    : null;
  const scopeIds = requestedScopeId ? (requestedScope ? [requestedScopeId] : []) : await getVisibleScopeIds(session);

  if (requestedScopeId && scopeIds.length === 0) {
    res.status(404).json({ error: "Scope not found" });
    return;
  }

  res.json(
    await listResources({
      scopeIds,
      type: requestedType || null,
      includeDeleted,
    }),
  );
});

router.get("/id/:id", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const resource = await getResourceById({
    id: req.params.id,
    scopeIds: await getVisibleScopeIds(session),
  });

  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }

  res.json(resource);
});

router.post("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const scopeId = typeof req.body.scopeId === "string" ? req.body.scopeId.trim() : "";
  const type = typeof req.body.type === "string" ? req.body.type.trim() : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const spec = req.body.spec as unknown;

  if (!scopeId || !type || !name) {
    res.status(400).json({ error: "scopeId, type, and name are required" });
    return;
  }

  const visibleScope = await getVisibleScopeById({
    session,
    scopeId,
  });

  if (!visibleScope) {
    res.status(404).json({ error: "Scope not found" });
    return;
  }

  try {
    const resource = await createResource({
      scopeId,
      type,
      name,
      spec: (spec ?? {}) as Prisma.InputJsonValue,
      createdBy: session.user.id,
      scopeIds: await getVisibleScopeIds(session),
    });

    res.status(201).json(resource);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create resource" });
  }
});

router.patch("/id/:id", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  try {
    const resource = await updateResource({
      id: req.params.id,
      scopeIds: await getVisibleScopeIds(session),
      input: {
        type: typeof req.body.type === "string" ? req.body.type : undefined,
        name: typeof req.body.name === "string" ? req.body.name : undefined,
        scopeId: typeof req.body.scopeId === "string" ? req.body.scopeId : undefined,
        spec: req.body.spec,
        status: req.body.status,
        desiredVersion: typeof req.body.desiredVersion === "number" ? req.body.desiredVersion : undefined,
        observedVersion: typeof req.body.observedVersion === "number" ? req.body.observedVersion : undefined,
        phase: typeof req.body.phase === "string" ? req.body.phase : undefined,
        health: typeof req.body.health === "string" ? req.body.health : undefined,
        provider: typeof req.body.provider === "string" || req.body.provider === null ? req.body.provider : undefined,
        targetId: typeof req.body.targetId === "string" || req.body.targetId === null ? req.body.targetId : undefined,
        labels: req.body.labels,
        annotations: req.body.annotations,
        createdBy: typeof req.body.createdBy === "string" || req.body.createdBy === null ? req.body.createdBy : undefined,
        lastError: typeof req.body.lastError === "string" || req.body.lastError === null ? req.body.lastError : undefined,
        deletedAt: typeof req.body.deletedAt === "string" ? req.body.deletedAt : req.body.deletedAt === null ? null : undefined,
      },
    });

    res.json(resource);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to update resource" });
  }
});

export default router;
