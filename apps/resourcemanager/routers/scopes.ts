import express from "express";

const router = express.Router();

import { getScopes, createScope, getScopeById, ensureTenantOrganizationScope, ensureUserScope, isDescendantOfScope } from "../functions/scopes";
import { VerifySession } from "keystone-lib";
import type { Request, Response } from "express";

type Session = NonNullable<Awaited<ReturnType<typeof VerifySession>>>;

function getCookie(req: Request, name: string) {
  const middlewareCookie = req.cookies?.[name];
  if (middlewareCookie) return middlewareCookie;

  return (req.headers.cookie ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const [cookieName, ...value] = cookie.split("=");
      return [cookieName, decodeURIComponent(value.join("="))] as const;
    })
    .find(([cookieName]) => cookieName === name)?.[1];
}

async function getSession(req: Request, res: Response) {
  const sessionId =
    req.header("x-keystone-session-id") ?? getCookie(req, "keystone.sid");
  const appId = process.env.KEYSTONE_APP_ID ?? process.env.APP_ID;
  const appSecret = process.env.KEYSTONE_APP_SECRET ?? process.env.APP_SECRET;
  const keystoneUrl = process.env.KEYSTONE_URL;

  if (!sessionId) {
    res.status(401).json({ error: "Missing Keystone session cookie" });
    return null;
  }

  if (!appId || !appSecret || !keystoneUrl) {
    res.status(500).json({ error: "Missing Keystone server configuration" });
    return null;
  }

  try {
    return await VerifySession({
      appId,
      keystoneUrl,
      sessionId,
      appSecret,
    });
  } catch {
    res.status(401).json({ error: "Invalid Keystone session" });
    return null;
  }
}

async function ensureTenantOrganization(session: Session) {
  return await ensureTenantOrganizationScope({
    tenantId: session.tenant.id,
    tenantName: session.tenant.displayName ?? session.tenant.name,
  });
}

async function ensureDefaultScopes(session: Session) {
  const tenantOrganization = await ensureTenantOrganization(session);
  const userScope = await ensureUserScope({
    userId: session.user.id,
    userName: session.user.name?.trim() || "User",
  });

  return {
    tenantOrganization,
    userScope,
  };
}

function visibleScopeOwnerIds(session: Session) {
  return [session.user.id, session.tenant.id];
}

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
