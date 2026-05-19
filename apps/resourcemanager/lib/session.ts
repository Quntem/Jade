import type { Request, Response } from "express";
import { VerifySession } from "keystone-lib";
import {
  ensureTenantOrganizationScope,
  ensureUserScope,
  getScopeById,
} from "../functions/scopes";

export type Session = NonNullable<Awaited<ReturnType<typeof VerifySession>>>;

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

export async function getSession(req: Request, res: Response) {
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

export async function ensureTenantOrganization(session: Session) {
  return await ensureTenantOrganizationScope({
    tenantId: session.tenant.id,
    tenantName: session.tenant.displayName ?? session.tenant.name,
  });
}

export async function ensureDefaultScopes(session: Session) {
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

export function visibleScopeOwnerIds(session: Session) {
  return [session.user.id, session.tenant.id];
}

export async function getVisibleScopeById({
  session,
  scopeId,
}: {
  session: Session;
  scopeId: string;
}) {
  const { tenantOrganization } = await ensureDefaultScopes(session);

  return await getScopeById({
    id: scopeId,
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });
}
