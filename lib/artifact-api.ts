import type {
  ArtifactRecord,
  ArtifactType
} from "@/lib/stores/useArtifactsStore";

type BackendArtifact = {
  type?: string;
  status?: string;
  json?: unknown;
  data?: unknown;
  error?: string | null;
  errorMessage?: string | null;
  jobId?: string | null;
  job_id?: string | null;
};

const BACKEND_TYPES: Record<ArtifactType, string[]> = {
  outline: ["OUTLINE"],
  summary: ["SUMMARY_SHORT", "SUMMARY_MEDIUM"],
  flashcards: ["FLASHCARDS"],
  quiz: ["QUIZ"],
  mindmap: ["MIND_MAP"],
  report: ["STUDY_GUIDE"]
};

function toBackendTypes(artifactType: ArtifactType) {
  return BACKEND_TYPES[artifactType];
}

function toBackendGenerateBody(
  artifactType: ArtifactType,
  language?: string
) {
  const backendTypes = toBackendTypes(artifactType);

  if (backendTypes.length > 1) {
    return {
      types: backendTypes,
      ...(language ? { language } : {}),
      mode: "async"
    };
  }

  return {
    artifactType: backendTypes[0],
    ...(language ? { language } : {}),
    mode: "async"
  };
}

function withLanguageQuery(path: string, language?: string) {
  return language
    ? `${path}?language=${encodeURIComponent(language)}`
    : path;
}

function getArtifactArray(payload: unknown): BackendArtifact[] {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as {
    artifacts?: unknown;
    artifact?: unknown;
  };

  if (Array.isArray(record.artifacts)) {
    return record.artifacts as BackendArtifact[];
  }

  if (record.artifact && typeof record.artifact === "object") {
    return [record.artifact as BackendArtifact];
  }

  return [];
}

function normalizeStatus(value: unknown): ArtifactRecord["status"] {
  if (value === "READY" || value === "ready") return "ready";
  if (value === "GENERATING" || value === "generating") return "generating";
  if (value === "FAILED" || value === "error") return "error";
  return "empty";
}

function combineStatus(items: BackendArtifact[]): ArtifactRecord["status"] {
  const statuses = items.map((item) => normalizeStatus(item.status));

  if (statuses.includes("generating")) return "generating";
  if (statuses.includes("ready")) return "ready";
  if (statuses.includes("error")) return "error";
  return "empty";
}

function normalizeData(type: ArtifactType, items: BackendArtifact[]) {
  if (type === "summary") {
    const shortSummary = items.find((item) => item.type === "SUMMARY_SHORT");
    const mediumSummary = items.find((item) => item.type === "SUMMARY_MEDIUM");

    return {
      short: shortSummary?.json ?? shortSummary?.data ?? null,
      medium: mediumSummary?.json ?? mediumSummary?.data ?? null,
      full: mediumSummary?.json ?? mediumSummary?.data ?? null
    };
  }

  const item = items[0];
  return item?.json ?? item?.data ?? null;
}

export function normalizeArtifactRecords(payload: unknown) {
  const artifacts = getArtifactArray(payload);
  const records: Partial<Record<ArtifactType, ArtifactRecord>> = {};

  for (const [frontendType, backendTypes] of Object.entries(BACKEND_TYPES) as Array<
    [ArtifactType, string[]]
  >) {
    const matches = artifacts.filter((artifact) =>
      backendTypes.includes(String(artifact.type))
    );

    if (matches.length === 0) continue;

    const status = combineStatus(matches);
    const first = matches[0];

    records[frontendType] = {
      status,
      data: status === "ready" ? normalizeData(frontendType, matches) : null,
      error:
        first.errorMessage ??
        first.error ??
        (status === "error" ? "Generation needs another try." : null),
      jobId: first.jobId ?? first.job_id ?? null
    };
  }

  return records;
}

export async function fetchArtifacts(chatId: string, language?: string) {
  const response = await fetch(
    withLanguageQuery(`/api/notebooks/${chatId}/artifacts`, language),
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("Could not load artifacts");
  }

  return response.json();
}

export async function generateArtifact(
  chatId: string,
  artifactType: ArtifactType,
  language?: string
) {
  const response = await fetch(`/api/notebooks/${chatId}/artifacts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toBackendGenerateBody(artifactType, language))
  });

  if (!response.ok) {
    throw new Error("Could not start artifact generation");
  }

  return response.json();
}

export async function fetchArtifactStatus(
  chatId: string,
  artifactType: ArtifactType,
  language?: string
): Promise<ArtifactRecord> {
  const payload = await fetchArtifacts(chatId, language);
  const records = normalizeArtifactRecords(payload);

  return (
    records[artifactType] ?? {
      status: "empty",
      data: null,
      error: null,
      jobId: null
    }
  );
}

export async function fetchArtifactResult(
  chatId: string,
  artifactType: ArtifactType,
  language?: string
) {
  const backendTypes = toBackendTypes(artifactType);
  const payloads = await Promise.all(
    backendTypes.map(async (type) => {
      const response = await fetch(
        withLanguageQuery(`/api/notebooks/${chatId}/artifacts/${type}`, language),
        {
          method: "GET",
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error("Could not load artifact");
      }

      return response.json();
    })
  );

  const records = normalizeArtifactRecords({ artifacts: payloads.flatMap(getArtifactArray) });
  const record = records[artifactType];

  if (!record) {
    throw new Error("Could not load artifact");
  }

  return { data: record.data };
}
