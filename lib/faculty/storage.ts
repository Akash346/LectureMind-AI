import {
  BlobServiceClient,
  type ContainerClient
} from "@azure/storage-blob";

import { getAzureStorageConfig } from "@/lib/config/server-env";

const REQUIRED_FACULTY_CONTAINER = "faculty-sessions";

let blobServiceClient: BlobServiceClient | null = null;

export function getFacultyUploadStorageKey(input: {
  sessionId: string;
  uploadId: string;
}) {
  return `faculty/${input.sessionId}/uploads/${input.uploadId}-original`;
}

export function getFacultyArtifactStorageKey(input: {
  sessionId: string;
  artifactId: string;
  extension?: "docx" | "json";
}) {
  return `faculty/${input.sessionId}/artifacts/${input.artifactId}.${
    input.extension ?? "docx"
  }`;
}

export async function uploadFacultyBlob(input: {
  storageKey: string;
  bytes: Buffer;
  contentType: string;
}) {
  const container = getFacultyContainerClient();
  const blob = container.getBlockBlobClient(input.storageKey);

  await blob.uploadData(input.bytes, {
    blobHTTPHeaders: {
      blobContentType: input.contentType
    }
  });

  return {
    storageKey: input.storageKey
  };
}

export async function downloadFacultyBlob(storageKey: string) {
  const container = getFacultyContainerClient();
  const blob = container.getBlockBlobClient(storageKey);
  const properties = await blob.getProperties();
  const buffer = await blob.downloadToBuffer();

  return {
    buffer,
    contentType: properties.contentType ?? "application/octet-stream",
    size: properties.contentLength ?? buffer.length
  };
}

export async function deleteFacultyBlob(storageKey: string) {
  const container = getFacultyContainerClient();
  assertFacultyDeleteContainer(container.containerName);
  await container.getBlockBlobClient(storageKey).deleteIfExists();
}

export async function deleteFacultySessionBlobs(sessionId: string) {
  const container = getFacultyContainerClient();
  assertFacultyDeleteContainer(container.containerName);

  const prefix = `faculty/${sessionId}/`;
  let removed = 0;

  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (!blob.name.startsWith(prefix)) {
      throw new Error(`Refusing to delete blob outside Faculty prefix: ${blob.name}`);
    }

    await container.deleteBlob(blob.name, {
      deleteSnapshots: "include"
    });
    removed += 1;
  }

  return {
    removed
  };
}

export function isFacultyStorageConfigured() {
  const config = getAzureStorageConfig();

  return Boolean(config.connectionString && config.facultyContainer);
}

export function getFacultyContainerName() {
  return getAzureStorageConfig().facultyContainer;
}

export async function isFacultyStorageContainerReachable() {
  try {
    await getFacultyContainerClient().getProperties();
    return true;
  } catch {
    return false;
  }
}

function getFacultyContainerClient(): ContainerClient {
  const config = getAzureStorageConfig();

  if (!config.connectionString) {
    throw new Error("Azure Storage connection string is not configured.");
  }

  if (!config.facultyContainer) {
    throw new Error("Azure Faculty storage container is not configured.");
  }

  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      config.connectionString
    );
  }

  return blobServiceClient.getContainerClient(config.facultyContainer);
}

function assertFacultyDeleteContainer(containerName: string) {
  if (containerName !== REQUIRED_FACULTY_CONTAINER) {
    throw new Error(
      `Refusing Faculty blob delete from unexpected container: ${containerName}`
    );
  }
}
