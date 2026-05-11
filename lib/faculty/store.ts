"use client";

import { create } from "zustand";

export type FacultyArtifactType = "improvement" | "bias" | "accessibility";

export type FacultyState = {
  sessionId: string | null;
  workspaceId: string | null;
  lectureUrl: string;
  status: "idle" | "creating" | "ingesting" | "indexing" | "ready" | "failed";
  reportRunning: boolean;
  uploadInProgress: boolean;
  activeArtifact: FacultyArtifactType | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    citations?: Array<{
      reference: string;
      timestamp?: string;
      quote?: string;
    }>;
  }>;
  uploads: Array<{
    id: string;
    originalName: string;
    status: "uploaded" | "ocr" | "remediating" | "complete" | "failed";
  }>;
  setSession: (input: {
    sessionId: string | null;
    workspaceId: string | null;
  }) => void;
  setLectureUrl: (lectureUrl: string) => void;
  setStatus: (status: FacultyState["status"]) => void;
  setReportRunning: (running: boolean) => void;
  setUploadInProgress: (inProgress: boolean) => void;
  setActiveArtifact: (artifact: FacultyArtifactType | null) => void;
  addMessage: (message: FacultyState["messages"][number]) => void;
  updateMessage: (id: string, patch: Partial<FacultyState["messages"][number]>) => void;
  addUpload: (upload: FacultyState["uploads"][number]) => void;
  updateUpload: (id: string, patch: Partial<FacultyState["uploads"][number]>) => void;
  reset: () => void;
};

const initialState = {
  sessionId: null,
  workspaceId: null,
  lectureUrl: "",
  status: "idle" as const,
  reportRunning: false,
  uploadInProgress: false,
  activeArtifact: null,
  messages: [],
  uploads: []
};

const ACTIVE_POLL_INTERVAL_MS = 1_000;
const IDLE_POLL_INTERVAL_MS = 30_000;
const TRANSITION_POLL_INTERVAL_MS = 2_500;

export const useFacultyStore = create<FacultyState>((set) => ({
  ...initialState,
  setSession: (input) => set(input),
  setLectureUrl: (lectureUrl) => set({ lectureUrl }),
  setStatus: (status) => set({ status }),
  setReportRunning: (reportRunning) => set({ reportRunning }),
  setUploadInProgress: (uploadInProgress) => set({ uploadInProgress }),
  setActiveArtifact: (activeArtifact) => set({ activeArtifact }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, ...patch } : message
      )
    })),
  addUpload: (upload) =>
    set((state) => ({ uploads: [...state.uploads, upload] })),
  updateUpload: (id, patch) =>
    set((state) => ({
      uploads: state.uploads.map((upload) =>
        upload.id === id ? { ...upload, ...patch } : upload
      )
    })),
  reset: () => set(initialState)
}));

export function getFacultyWorkspacePollIntervalMs(input: {
  workspaceStatus?: string | null;
  artifactStatuses?: Array<string | null | undefined>;
  reportRunning?: boolean;
  uploadInProgress?: boolean;
}) {
  const workspaceStatus = input.workspaceStatus ?? "pending";
  const artifactRunning = (input.artifactStatuses ?? []).some(
    (status) => status === "running"
  );
  const active =
    workspaceStatus === "ingesting" ||
    workspaceStatus === "indexing" ||
    workspaceStatus === "creating" ||
    workspaceStatus === "pending" ||
    artifactRunning ||
    Boolean(input.reportRunning) ||
    Boolean(input.uploadInProgress);

  if (active) {
    return ACTIVE_POLL_INTERVAL_MS;
  }

  if (workspaceStatus === "ready" || workspaceStatus === "failed") {
    return IDLE_POLL_INTERVAL_MS;
  }

  return TRANSITION_POLL_INTERVAL_MS;
}
