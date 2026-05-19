import express from "express";
import { getServerById, getServers } from "../functions/servers";
import { getScopes } from "../functions/scopes";
import {
  ensureDefaultScopes,
  getSession,
  getVisibleScopeById,
  visibleScopeOwnerIds,
} from "../lib/session";

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

  const requestedScopeId =
    typeof req.query.scopeId === "string" ? req.query.scopeId.trim() : "";

  if (requestedScopeId) {
    const scope = await getVisibleScopeById({
      session,
      scopeId: requestedScopeId,
    });

    if (!scope) {
      res.status(404).json({ error: "Scope not found" });
      return;
    }

    const servers = await getServers({ scopeIds: [scope.id] });
    res.json(servers);
    return;
  }

  const servers = await getServers({
    scopeIds: await getVisibleScopeIds(session),
  });

  res.json(servers);
});

router.get("/id/:id", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const id = req.params.id;

  if (!id) {
    res.status(400).json({ error: "Server id is required" });
    return;
  }

  const server = await getServerById({
    id,
    scopeIds: await getVisibleScopeIds(session),
  });

  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  res.json(server);
});

export default router;
