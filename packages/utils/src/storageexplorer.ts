import { Files } from "files-sdk";
import { s3 } from "files-sdk/s3";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { S3Adapter } from "files-sdk/s3";

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
