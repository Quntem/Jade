import express from "express";
import { browseSeaweedFsBucket } from "../functions/storageexplorer";
import { ensureDefaultScopes, getSession, visibleScopeOwnerIds } from "../lib/session";
import { getScopes } from "../functions/scopes";

const router = express.Router();

router.get("/resource/:resourceId/browse", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const { tenantOrganization } = await ensureDefaultScopes(session);
  const scopes = await getScopes({
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });

  const location = typeof req.query.location === "string" ? req.query.location : "";
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  try {
    const files = await browseSeaweedFsBucket({
      resourceId: req.params.resourceId,
      scopeIds: scopes.map((scope) => scope.id),
      location,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    res.json({ success: true, files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to browse storage";
    const status = message === "Bucket resource not found" ? 404 : message === "Bucket is not ready yet" ? 409 : 504;
    res.status(status).json({ error: message });
  }
});

export default router;
