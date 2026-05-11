import { create } from "zustand";

export type ArtifactType =
  | "outline"
  | "summary"
  | "flashcards"
  | "quiz"
  | "mindmap"
  | "report";

export type ArtifactStatus = "empty" | "generating" | "ready" | "error";

export type ArtifactRecord = {
  status: ArtifactStatus;
  data: unknown | null;
  error: string | null;
  jobId?: string | null;
};

type ArtifactsState = {
  artifacts: Record<ArtifactType, ArtifactRecord>;
  hydrateArtifacts: (
    records: Partial<Record<ArtifactType, ArtifactRecord>>
  ) => void;
  setArtifactStatus: (
    type: ArtifactType,
    patch: Partial<ArtifactRecord>
  ) => void;
  resetArtifacts: () => void;
};

export const ARTIFACT_TYPES: ArtifactType[] = [
  "outline",
  "summary",
  "flashcards",
  "quiz",
  "mindmap",
  "report"
];

const EMPTY_ARTIFACTS = ARTIFACT_TYPES.reduce(
  (acc, type) => {
    acc[type] = {
      status: "empty",
      data: null,
      error: null,
      jobId: null
    };
    return acc;
  },
  {} as Record<ArtifactType, ArtifactRecord>
);

export const useArtifactsStore = create<ArtifactsState>((set) => ({
  artifacts: EMPTY_ARTIFACTS,
  hydrateArtifacts: (records) =>
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        ...records
      }
    })),
  setArtifactStatus: (type, patch) =>
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [type]: {
          ...state.artifacts[type],
          ...patch
        }
      }
    })),
  resetArtifacts: () =>
    set({
      artifacts: ARTIFACT_TYPES.reduce(
        (acc, type) => {
          acc[type] = {
            status: "empty",
            data: null,
            error: null,
            jobId: null
          };
          return acc;
        },
        {} as Record<ArtifactType, ArtifactRecord>
      )
    })
}));
