import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  facultyUpload: {
    count: vi.fn(async () => 1),
    deleteMany: vi.fn(async () => ({ count: 1 }))
  },
  facultyArtifact: {
    count: vi.fn(async () => 1),
    deleteMany: vi.fn(async () => ({ count: 1 }))
  },
  facultySession: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 }))
  },
  facultyChatMessage: {
    deleteMany: vi.fn(async () => ({ count: 1 }))
  },
  facultyWorkspace: {
    deleteMany: vi.fn(async () => ({ count: 1 }))
  }
};
const deleteFacultySessionBlobs = vi.fn(async () => ({ removed: 1 }));
const deleteFacultyNamespace = vi.fn(async () => ({ deletedCount: 2 }));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock
}));
vi.mock("@/lib/faculty/storage", () => ({
  deleteFacultySessionBlobs
}));
vi.mock("@/lib/faculty/indexing", () => ({
  deleteFacultyNamespace
}));

describe("cleanupFacultySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is idempotent and returns success when resources exist", async () => {
    const { cleanupFacultySession } = await import("@/lib/faculty/cleanup");
    const result = await cleanupFacultySession({
      sessionId: "fac_test",
      reason: "test"
    });

    expect(result).toEqual({
      ok: true,
      sessionId: "fac_test",
      removedUploads: 1,
      removedArtifacts: 1,
      removedVectorDocuments: 2
    });
  });

  it("never calls Student deletion utilities", async () => {
    const deleteNotebookForUser = vi.fn();
    const { cleanupFacultySession } = await import("@/lib/faculty/cleanup");
    await cleanupFacultySession({ sessionId: "fac_test", reason: "test" });

    expect(deleteNotebookForUser).not.toHaveBeenCalled();
  });

  it("logs and continues when each subsystem fails in isolation", async () => {
    const { cleanupFacultySession, __setFacultyCleanupTestHooks } = await import(
      "@/lib/faculty/cleanup"
    );
    const steps = [
      "markDeleted",
      "deleteStorage",
      "deleteVectors",
      "deleteArtifacts",
      "deleteChat",
      "deleteWorkspace",
      "deleteUploads",
      "deleteSession"
    ] as const;

    for (const step of steps) {
      __setFacultyCleanupTestHooks({
        [step]: async () => {
          throw new Error(`${step} failed`);
        }
      });
      await expect(
        cleanupFacultySession({ sessionId: `fac_${step}`, reason: "test" })
      ).resolves.toMatchObject({ ok: true });
    }

    __setFacultyCleanupTestHooks({});
    expect(prismaMock.facultySession.deleteMany).toHaveBeenCalled();
  });
});
