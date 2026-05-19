import { createHash, randomBytes } from "node:crypto";
import { Prisma, prismaClient } from "@jade/database";

const ENROLLMENT_TOKEN_PREFIX = "jade_enroll_";
const AGENT_TOKEN_PREFIX = "jade_agent_";
const DEFAULT_ENROLLMENT_TOKEN_TTL_MINUTES = 60;
const MAX_ENROLLMENT_TOKEN_TTL_MINUTES = 24 * 60;

type CreateEnrollmentTokenOptions = {
  scopeId: string;
  createdBy: string;
  name?: string;
  description?: string | null;
  expiresInMinutes?: number;
};

type ListEnrollmentTokensOptions = {
  scopeIds: string[];
  includeInactive?: boolean;
};

type EnrollAgentOptions = {
  token: string;
  serverId?: string;
  name?: string;
  hostname?: string;
  os?: string;
  arch?: string;
  agentName?: string;
  agentVersion?: string;
  wireguardPublicKey?: string;
  labels?: Prisma.InputJsonValue;
  annotations?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  capabilities?: Prisma.InputJsonValue;
};

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function generateToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function normalizeTtlMinutes(expiresInMinutes: number | undefined) {
  if (
    typeof expiresInMinutes !== "number" ||
    !Number.isFinite(expiresInMinutes)
  ) {
    return DEFAULT_ENROLLMENT_TOKEN_TTL_MINUTES;
  }

  return Math.max(
    1,
    Math.min(Math.floor(expiresInMinutes), MAX_ENROLLMENT_TOKEN_TTL_MINUTES),
  );
}

function jsonObjectOrDefault(
  value: Prisma.InputJsonValue | undefined,
  fallback: Prisma.InputJsonValue,
) {
  return value === undefined ? fallback : value;
}

export async function createEnrollmentToken({
  scopeId,
  createdBy,
  name,
  description,
  expiresInMinutes,
}: CreateEnrollmentTokenOptions) {
  const token = generateToken(ENROLLMENT_TOKEN_PREFIX);
  const ttlMinutes = normalizeTtlMinutes(expiresInMinutes);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const tokenName = name?.trim() || "Server enrollment token";
  const tokenDescription = description?.trim() || null;

  const enrollmentToken = await prismaClient.enrollmentToken.create({
    data: {
      tokenHash: hashSecret(token),
      name: tokenName,
      description: tokenDescription,
      scopeId,
      createdBy,
      expiresAt,
    },
  });

  return {
    id: enrollmentToken.id,
    name: enrollmentToken.name,
    description: enrollmentToken.description,
    scopeId: enrollmentToken.scopeId,
    createdBy: enrollmentToken.createdBy,
    expiresAt: enrollmentToken.expiresAt,
    usedAt: enrollmentToken.usedAt,
    revokedAt: enrollmentToken.revokedAt,
    createdAt: enrollmentToken.createdAt,
    updatedAt: enrollmentToken.updatedAt,
    token,
  };
}

export async function listEnrollmentTokens({
  scopeIds,
  includeInactive = true,
}: ListEnrollmentTokensOptions) {
  if (scopeIds.length === 0) {
    return [];
  }

  const now = new Date();

  return await prismaClient.enrollmentToken.findMany({
    where: {
      scopeId: {
        in: scopeIds,
      },
      ...(includeInactive
        ? {}
        : {
            usedAt: null,
            revokedAt: null,
            expiresAt: {
              gt: now,
            },
          }),
    },
    select: {
      id: true,
      name: true,
      description: true,
      scopeId: true,
      createdBy: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function enrollAgent(options: EnrollAgentOptions) {
  const now = new Date();
  const enrollmentTokenHash = hashSecret(options.token);
  const agentToken = generateToken(AGENT_TOKEN_PREFIX);

  return await prismaClient.$transaction(async (tx) => {
    const enrollmentToken = await tx.enrollmentToken.findUnique({
      where: {
        tokenHash: enrollmentTokenHash,
      },
    });

    if (!enrollmentToken) {
      throw new EnrollmentError("Invalid enrollment token", 401);
    }

    if (enrollmentToken.revokedAt) {
      throw new EnrollmentError("Enrollment token has been revoked", 401);
    }

    if (enrollmentToken.usedAt) {
      throw new EnrollmentError("Enrollment token has already been used", 401);
    }

    if (enrollmentToken.expiresAt <= now) {
      throw new EnrollmentError("Enrollment token has expired", 401);
    }

    const consumedToken = await tx.enrollmentToken.updateMany({
      where: {
        id: enrollmentToken.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        usedAt: now,
      },
    });

    if (consumedToken.count !== 1) {
      throw new EnrollmentError("Enrollment token is no longer available", 409);
    }

    const existingServer = options.serverId
      ? await tx.server.findFirst({
          where: {
            id: options.serverId,
            scopeId: enrollmentToken.scopeId,
            deletedAt: null,
          },
        })
      : options.hostname
        ? await tx.server.findFirst({
            where: {
              scopeId: enrollmentToken.scopeId,
              hostname: options.hostname,
              deletedAt: null,
            },
            orderBy: {
              createdAt: "asc",
            },
          })
        : null;

    if (options.serverId && !existingServer) {
      throw new EnrollmentError("Server not found in enrollment scope", 404);
    }

    const serverName =
      options.name?.trim() ||
      options.hostname?.trim() ||
      existingServer?.name ||
      "Jade server";

    const serverCreateData = {
      name: serverName,
      scopeId: enrollmentToken.scopeId,
      hostname: options.hostname?.trim() || null,
      os: options.os?.trim() || null,
      arch: options.arch?.trim() || null,
      labels: jsonObjectOrDefault(options.labels, {}),
      annotations: jsonObjectOrDefault(options.annotations, {}),
      metadata: jsonObjectOrDefault(options.metadata, {}),
    };

    const serverUpdateData = {
      name: serverName,
      ...(options.hostname === undefined
        ? {}
        : { hostname: options.hostname.trim() || null }),
      ...(options.os === undefined ? {} : { os: options.os.trim() || null }),
      ...(options.arch === undefined
        ? {}
        : { arch: options.arch.trim() || null }),
      ...(options.labels === undefined ? {} : { labels: options.labels }),
      ...(options.annotations === undefined
        ? {}
        : { annotations: options.annotations }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    };

    const server = existingServer
      ? await tx.server.update({
          where: {
            id: existingServer.id,
          },
          data: serverUpdateData,
        })
      : await tx.server.create({
          data: serverCreateData,
        });

    const agent = await tx.agent.create({
      data: {
        serverId: server.id,
        name: options.agentName?.trim() || "jade-agent",
        version: options.agentVersion?.trim() || null,
        wireguardPublicKey: options.wireguardPublicKey?.trim() || null,
        capabilities: jsonObjectOrDefault(options.capabilities, {}),
      },
    });

    await tx.agentCredential.create({
      data: {
        agentId: agent.id,
        tokenHash: hashSecret(agentToken),
      },
    });

    return {
      agentId: agent.id,
      serverId: server.id,
      agentToken,
    };
  });
}

export class EnrollmentError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "EnrollmentError";
  }
}
