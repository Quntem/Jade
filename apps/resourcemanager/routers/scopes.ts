import express from "express";

const router = express.Router();

import { getScopes, createScope, getScopeById, ensureTenantOrganizationScope, ensureUserScope } from "../functions/scopes";
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

  await ensureDefaultScopes(session);
  const scopes = await getScopes({
    ownerIds: visibleScopeOwnerIds(session),
  });

  res.json(scopes);
});

router.get("/id/:id", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  await ensureDefaultScopes(session);
  const scope = await getScopeById({
    id: req.params.id as string,
    ownerIds: visibleScopeOwnerIds(session),
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

  const scope = await createScope({
    ownerId: session.user.id,
    name: req.body.name,
    description: req.body.description,
    type,
    parentId: req.body.parentId ?? tenantOrganization.id,
  });
  res.json(scope);
});

export default router;
