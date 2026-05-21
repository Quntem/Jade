import { Files } from "files-sdk";
import { s3 } from "files-sdk/s3";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { S3Adapter } from "files-sdk/s3";
import { prismaClient } from "@jade/database";
import { enqueueAgentJob } from "./agentJobs";
import { dispatchQueuedJobsToOnlineAgent } from "../sockets/agents";
import { getResourceById } from "./resources";

export type StorageExplorerItem = {
  name: string;
  key: string;
  size: number;
  type: string;
  kind: "file" | "folder";
  lastModified?: number;
  etag?: string;
  metadata?: Record<string, string>;
};

export type StorageExplorerList = {
  items: StorageExplorerItem[];
  cursor?: string;
};

type SeaweedFsConnection = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type SeaweedFsBucketResourceStatus = {
  connection?: SeaweedFsConnection | null;
};

type SeaweedFsBucketResourceSpec = {
  placement?: {
    primaryServerId?: string;
  };
};

type BrowseSeaweedFsBucketOptions = {
  resourceId: string;
  scopeIds: string[];
  location?: string;
  cursor?: string;
  limit?: number;
};

export function createS3FilesClient({
  bucket,
  region,
  accessKeyId,
  secretAccessKey,
  endpoint,
}: {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}) {
  return new Files({
    adapter: s3({ bucket, region, credentials: { accessKeyId, secretAccessKey }, endpoint }),
  });
}

export async function listS3Directory({
  client,
  prefix = "",
  cursor,
  limit,
}: {
  client: Files<S3Adapter>;
  prefix?: string;
  cursor?: string;
  limit?: number;
}): Promise<StorageExplorerList> {
  const normalizedPrefix = normalizePrefix(prefix);
  const result = await client.raw.send(new ListObjectsV2Command({
    Bucket: client.adapter.bucket,
    Delimiter: "/",
    ...(normalizedPrefix ? { Prefix: normalizedPrefix } : {}),
    ...(limit !== undefined ? { MaxKeys: limit } : {}),
    ...(cursor ? { ContinuationToken: cursor } : {}),
  }));

  const folders: StorageExplorerItem[] = (result.CommonPrefixes ?? [])
    .map((commonPrefix) => commonPrefix.Prefix)
    .filter((folderPrefix): folderPrefix is string => Boolean(folderPrefix))
    .map((folderPrefix) => ({
      name: getDisplayName(folderPrefix),
      key: folderPrefix,
      size: 0,
      type: "folder",
      kind: "folder",
    }));

  const files = (result.Contents ?? [])
    .map<StorageExplorerItem | null>((object) => {
      const key = object.Key ?? "";

      if (!key || key === normalizedPrefix) {
        return null;
      }

      return {
        name: getDisplayName(key),
        key,
        size: Number(object.Size ?? 0),
        type: "application/octet-stream",
        kind: "file" as const,
        lastModified: object.LastModified?.getTime(),
        etag: object.ETag?.replaceAll(/^"+|"+$/gu, ""),
      };
    })
    .filter((item): item is StorageExplorerItem => item !== null);

  return {
    cursor: result.IsTruncated ? result.NextContinuationToken : undefined,
    items: [...folders, ...files],
  };
}

function normalizePrefix(prefix: string) {
  const trimmed = prefix.replace(/^\/+/u, "");

  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function getDisplayName(key: string) {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.split("/").at(-1) || key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSeaweedFsConnection(resourceStatus: unknown) {
  if (!resourceStatus || typeof resourceStatus !== "object" || Array.isArray(resourceStatus)) {
    return null;
  }

  const connection = (resourceStatus as SeaweedFsBucketResourceStatus).connection;

  if (
    !connection ||
    typeof connection !== "object" ||
    Array.isArray(connection) ||
    typeof connection.endpoint !== "string" ||
    typeof connection.accessKeyId !== "string" ||
    typeof connection.secretAccessKey !== "string" ||
    typeof connection.bucket !== "string"
  ) {
    return null;
  }

  return connection;
}

function getPrimaryServerId(resourceSpec: unknown) {
  if (!resourceSpec || typeof resourceSpec !== "object" || Array.isArray(resourceSpec)) {
    return null;
  }

  const placement = (resourceSpec as SeaweedFsBucketResourceSpec).placement;

  if (!placement || typeof placement !== "object" || Array.isArray(placement)) {
    return null;
  }

  return typeof placement.primaryServerId === "string" && placement.primaryServerId.trim().length > 0
    ? placement.primaryServerId.trim()
    : null;
}

function pickOnlineAgent(server: {
  agents: Array<{
    id: string;
    deletedAt: Date | null;
    createdAt: Date;
    status: "Unknown" | "Online" | "Offline" | "Degraded";
    lastSeenAt: Date | null;
  }>;
}) {
  return server.agents
    .filter((agent) => agent.deletedAt === null)
    .filter((agent) => agent.status === "Online" || agent.status === "Degraded")
    .sort((first, second) => {
      const firstSeen = first.lastSeenAt?.getTime() ?? first.createdAt.getTime();
      const secondSeen = second.lastSeenAt?.getTime() ?? second.createdAt.getTime();

      return secondSeen - firstSeen;
    })[0];
}

async function waitForAgentJobResult(jobId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const job = await prismaClient.agentJob.findUnique({
      where: {
        id: jobId,
      },
      select: {
        status: true,
        result: true,
        lastError: true,
      },
    });

    if (!job) {
      throw new Error("Storage browse job was not found");
    }

    if (job.status === "Succeeded") {
      return job.result as StorageExplorerList;
    }

    if (job.status === "Failed" || job.status === "Expired" || job.status === "Cancelled") {
      throw new Error(job.lastError ?? "Unable to browse storage");
    }

    await sleep(250);
  }

  throw new Error("Timed out waiting for storage explorer response");
}

export async function browseSeaweedFsBucket({
  resourceId,
  scopeIds,
  location = "",
  cursor,
  limit,
}: BrowseSeaweedFsBucketOptions): Promise<StorageExplorerList> {
  const resource = await getResourceById({
    id: resourceId,
    scopeIds,
  });

  if (!resource || resource.type !== "jade.storage.bucket") {
    throw new Error("Bucket resource not found");
  }

  const connection = getSeaweedFsConnection(resource.status);

  if (!connection) {
    throw new Error("Bucket is not ready yet");
  }

  const primaryServerId = getPrimaryServerId(resource.spec);

  if (!primaryServerId) {
    throw new Error("Bucket resource is missing its primary server");
  }

  const server = await prismaClient.server.findFirst({
    where: {
      id: primaryServerId,
      deletedAt: null,
    },
    include: {
      agents: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!server) {
    throw new Error("Primary server was not found");
  }

  const agent = pickOnlineAgent(server);

  if (!agent) {
    throw new Error("The primary server does not have an online agent");
  }

  const job = await enqueueAgentJob({
    agentId: agent.id,
    type: "BrowseStorage",
    payload: {
      connection,
      location,
      cursor: cursor ?? null,
      limit: limit ?? null,
    },
    resourceId: resource.id,
    targetId: null,
    deploymentStepId: null,
    maxAttempts: 1,
  });

  await dispatchQueuedJobsToOnlineAgent(agent.id);

  return await waitForAgentJobResult(job.id);
}
