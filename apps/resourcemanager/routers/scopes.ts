import express from "express";

const router = express.Router();

import { getScopes, createScope, getScopeById, isDescendantOfScope } from "../functions/scopes";
import { ensureDefaultScopes, getSession, visibleScopeOwnerIds } from "../lib/session";

router.get("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const { tenantOrganization } = await ensureDefaultScopes(session);
  const scopes = await getScopes({
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });

  res.json(scopes);
});

router.get("/id/:id", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const { tenantOrganization } = await ensureDefaultScopes(session);
  const scope = await getScopeById({
    id: req.params.id as string,
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });

  if (!scope) {
    res.status(404).json({ error: "Scope not found" });
    return;
  }

  res.json(scope);
});

router.post("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;
  const { tenantOrganization, userScope } = await ensureDefaultScopes(session);
  const type = req.body.type;
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body.description === "string" && req.body.description.trim().length > 0
      ? req.body.description.trim()
      : null;
  const requestedParentId =
    typeof req.body.parentId === "string" && req.body.parentId.trim().length > 0
      ? req.body.parentId.trim()
      : tenantOrganization.id;
  const isOrganization = type === "Organization";
  const isUser = type === "User";

  if (isOrganization) {
    res.json(tenantOrganization);
    return;
  }

  if (isUser) {
    res.json(userScope);
    return;
  }

  if (!name) {
    res.status(400).json({ error: "Scope name is required" });
    return;
  }

  const parentScope = await getScopeById({
    id: requestedParentId,
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });

  if (!parentScope) {
    res.status(400).json({ error: "Parent scope not found" });
    return;
  }

  const parentIsInOrganizationTree =
    parentScope.id === tenantOrganization.id ||
    (await isDescendantOfScope({
      scope: parentScope,
      ancestorId: tenantOrganization.id,
    }));

  const scope = await createScope({
    ownerId: parentIsInOrganizationTree ? session.tenant.id : session.user.id,
    name,
    description,
    type,
    parentId: parentScope.id,
  });
  res.json(scope);
});

export default router;
