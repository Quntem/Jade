import express from "express";
import { createS3FilesClient, listS3Directory } from "../functions/storageexplorer";

const router = express.Router();

router.get("/resource/:resourceId/browse", async (req, res) => {
  const client = createS3FilesClient({
    bucket: "testbucket",
    region: "us-east-1",
    accessKeyId: "your-access-key",
    secretAccessKey: "your-secret-key",
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
