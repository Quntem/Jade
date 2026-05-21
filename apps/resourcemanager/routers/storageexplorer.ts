import express from "express";
import { createS3FilesClient, listS3Directory } from "../functions/storageexplorer";
import { getResourceById } from "../functions/resources";
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

  const resource = await getResourceById({
    id: req.params.resourceId,
    scopeIds: scopes.map((scope) => scope.id),
  });

  if (!resource || resource.type !== "jade.storage.bucket") {
    res.status(404).json({ error: "Bucket resource not found" });
    return;
  }

  const connection = (resource.status as {
    connection?: {
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
    };
  }).connection;

  if (!connection) {
    res.status(409).json({ error: "Bucket is not ready yet" });
    return;
  }

  const client = createS3FilesClient({
    bucket: connection.bucket,
    region: "us-east-1",
    accessKeyId: connection.accessKeyId,
    secretAccessKey: connection.secretAccessKey,
    endpoint: connection.endpoint,
  });

  const location = typeof req.query.location === "string" ? req.query.location : "";
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  const files = await listS3Directory({
    client,
    prefix: location,
    cursor,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  res.json({ success: true, files });
});

export default router;
