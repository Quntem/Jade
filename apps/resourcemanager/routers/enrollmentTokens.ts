import express from "express";
import {
  createEnrollmentToken,
  listEnrollmentTokens,
} from "../functions/agentEnrollment";
import {
  ensureDefaultScopes,
  getSession,
  getVisibleScopeById,
  visibleScopeOwnerIds,
} from "../lib/session";
import { getScopes } from "../functions/scopes";

const router = express.Router();

router.get("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const requestedScopeId =
    typeof req.query.scopeId === "string" ? req.query.scopeId.trim() : "";
  const includeInactive = req.query.includeInactive !== "false";

  if (requestedScopeId) {
    const scope = await getVisibleScopeById({
      session,
      scopeId: requestedScopeId,
    });

    if (!scope) {
      res.status(404).json({ error: "Scope not found" });
      return;
    }

    const tokens = await listEnrollmentTokens({
      scopeIds: [scope.id],
      includeInactive,
    });

    res.json(tokens);
    return;
  }

  const { tenantOrganization } = await ensureDefaultScopes(session);
  const scopes = await getScopes({
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });
  const tokens = await listEnrollmentTokens({
    scopeIds: scopes.map((scope) => scope.id),
    includeInactive,
  });

  res.json(tokens);
});

router.post("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const scopeId =
    typeof req.body.scopeId === "string" ? req.body.scopeId.trim() : "";

  if (!scopeId) {
    res.status(400).json({ error: "scopeId is required" });
    return;
  }

  const scope = await getVisibleScopeById({ session, scopeId });

  if (!scope) {
    res.status(404).json({ error: "Scope not found" });
    return;
  }

  const expiresInMinutes =
    typeof req.body.expiresInMinutes === "number"
      ? req.body.expiresInMinutes
      : undefined;
  const name =
    typeof req.body.name === "string" && req.body.name.trim().length > 0
      ? req.body.name.trim()
      : undefined;
  const description =
    typeof req.body.description === "string" &&
    req.body.description.trim().length > 0
      ? req.body.description.trim()
      : null;

  const enrollmentToken = await createEnrollmentToken({
    scopeId: scope.id,
    createdBy: session.user.id,
    name,
    description,
    expiresInMinutes,
  });

  res.status(201).json(enrollmentToken);
});

export default router;
