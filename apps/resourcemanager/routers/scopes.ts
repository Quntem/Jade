import express from "express";

const router = express.Router();

import { getScopes, createScope, getScopeById } from "../functions/scopes";
import { VerifySession } from "keystone-lib";
import type { Request, Response } from "express";

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

router.get("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const scopes = await getScopes({ ownerId: session?.user?.id });
  res.json(scopes);
});

router.get("/id/:id", async (req, res) => {
  const scope = await getScopeById({ id: req.params.id as string });
  res.json(scope);
});

router.post("/", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  const scope = await createScope({
    ownerId: session?.user?.id,
    name: req.body.name,
    description: req.body.description,
    type: req.body.type,
    parentId: req.body.parentId,
  });
  res.json(scope);
});

export default router;
