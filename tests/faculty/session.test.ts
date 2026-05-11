import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();
const createSession = vi.fn();
const createWorkspace = vi.fn();
const transaction = vi.fn(
  async (
    run: (tx: {
      facultySession: { create: typeof createSession };
      facultyWorkspace: { create: typeof createWorkspace };
    }) => Promise<unknown>
  ) =>
  run({
    facultySession: { create: createSession },
    facultyWorkspace: { create: createWorkspace }
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    facultySession: {
      updateMany
    }
  }
}));

describe("faculty session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSession.mockImplementation(async ({ data }) => data);
    createWorkspace.mockResolvedValue({});
  });

  it("createFacultySession creates namespace faculty underscore session id", async () => {
    const { createFacultySession, getFacultyNamespace } = await import(
      "@/lib/faculty/session"
    );
    const session = await createFacultySession({
      lectureUrl: "https://www.youtube.com/watch?v=abc12345678"
    });

    expect(session.azureNamespace).toBe(getFacultyNamespace(session.id));
    expect(session.azureNamespace).toBe(`faculty_${session.id}`);
    expect(createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: session.workspaceId,
          sessionId: session.id
        })
      })
    );
  });

  it("touchFacultySession updates lastActiveAt", async () => {
    const { touchFacultySession } = await import("@/lib/faculty/session");
    await touchFacultySession("fac_test");

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fac_test", deletedAt: null },
        data: expect.objectContaining({
          lastActiveAt: expect.any(Date)
        })
      })
    );
  });
});
