import express from "express";
import {
  createVpnHub,
  deliverVpnConfig,
  getHubDesiredState,
  getVpnHubs,
  getVpnPeers,
  provisionVpnPeer,
  recordHubStatus,
  renderSpokeConfig,
  VpnError,
} from "../functions/vpn";
import { getScopes } from "../functions/scopes";
import {
  ensureDefaultScopes,
  getSession,
  visibleScopeOwnerIds,
  type Session,
} from "../lib/session";

const router = express.Router();

async function getVisibleScopeIds(session: Session) {
  const { tenantOrganization } = await ensureDefaultScopes(session);
  const scopes = await getScopes({
    ownerIds: visibleScopeOwnerIds(session),
    tenantOrganizationId: tenantOrganization.id,
  });

  return scopes.map((scope) => scope.id);
}

function stringBody(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "";
}

function numberBody(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function getHubToken(req: express.Request) {
  const explicitToken = req.header("x-jade-vpn-hub-token");
  if (explicitToken) {
    return explicitToken;
  }

  const authorization = req.header("authorization");
  if (!authorization) {
    return "";
  }

  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

function handleVpnError(res: express.Response, error: unknown) {
  if (error instanceof VpnError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  throw error;
}

router.get("/hubs", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  res.json(await getVpnHubs());
});

router.post("/hubs", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  try {
    const hub = await createVpnHub({
      name: stringBody(req.body.name),
      endpointHost: stringBody(req.body.endpointHost),
      endpointPort: numberBody(req.body.endpointPort),
      publicKey: stringBody(req.body.publicKey),
      serviceToken:
        typeof req.body.serviceToken === "string"
          ? req.body.serviceToken.trim()
          : undefined,
    });

    res.status(201).json(hub);
  } catch (error) {
    handleVpnError(res, error);
  }
});

router.get("/peers", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  res.json(await getVpnPeers({ scopeIds: await getVisibleScopeIds(session) }));
});

router.post("/peers/:serverId/provision", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  try {
    const peer = await provisionVpnPeer({
      serverId: req.params.serverId,
      scopeIds: await getVisibleScopeIds(session),
      hubId:
        typeof req.body.hubId === "string" && req.body.hubId.trim().length > 0
          ? req.body.hubId.trim()
          : undefined,
      wireguardPublicKey:
        typeof req.body.wireguardPublicKey === "string"
          ? req.body.wireguardPublicKey.trim()
          : undefined,
    });

    res.status(201).json(peer);
  } catch (error) {
    handleVpnError(res, error);
  }
});

router.get("/peers/:serverId/config", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  try {
    res.json(
      await renderSpokeConfig({
        serverId: req.params.serverId,
        scopeIds: await getVisibleScopeIds(session),
      }),
    );
  } catch (error) {
    handleVpnError(res, error);
  }
});

router.post("/peers/:serverId/deliver-config", async (req, res) => {
  const session = await getSession(req, res);
  if (!session) return;

  try {
    res.status(201).json(
      await deliverVpnConfig({
        serverId: req.params.serverId,
        scopeIds: await getVisibleScopeIds(session),
      }),
    );
  } catch (error) {
    handleVpnError(res, error);
  }
});

router.get("/hub-state", async (req, res) => {
  try {
    res.json(
      await getHubDesiredState({
        hubId: stringBody(req.query.hubId),
        serviceToken: getHubToken(req),
        publicKey: stringBody(req.query.publicKey),
      }),
    );
  } catch (error) {
    handleVpnError(res, error);
  }
});

router.post("/hub-status", async (req, res) => {
  try {
    res.json(
      await recordHubStatus({
        hubId: stringBody(req.body.hubId),
        serviceToken: getHubToken(req),
        status: req.body.status,
        publicKey: stringBody(req.body.publicKey),
      }),
    );
  } catch (error) {
    handleVpnError(res, error);
  }
});

export default router;
