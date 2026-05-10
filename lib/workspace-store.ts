"use client";

import { create } from "zustand";

type WorkspaceState = {
  sourceOpen: boolean;
  studioOpen: boolean;
  toggleSource: () => void;
  toggleStudio: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sourceOpen: true,
  studioOpen: true,
  toggleSource: () => set((state) => ({ sourceOpen: !state.sourceOpen })),
  toggleStudio: () => set((state) => ({ studioOpen: !state.studioOpen }))
}));
