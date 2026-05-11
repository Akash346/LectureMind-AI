import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("faculty isolation", () => {
  it("Faculty retrieval always includes namespace filter", async () => {
    const { buildFacultyNamespaceFilter } = await import("@/lib/faculty/indexing");
    expect(buildFacultyNamespaceFilter({ sessionId: "fac_test" })).toContain(
      "namespace eq 'faculty_fac_test'"
    );
  });

  it("Faculty routes live only under app/api/faculty", () => {
    const apiFiles = listFiles(join(process.cwd(), "app", "api"));
    const facultyFiles = apiFiles.filter((file) => file.includes("faculty"));

    expect(facultyFiles.length).toBeGreaterThan(0);
    expect(
      facultyFiles.every((file) =>
        file.includes(`${join("app", "api", "faculty")}`)
      )
    ).toBe(true);
  });

  it("Student notebook API files do not import Faculty modules", () => {
    const notebookFiles = listFiles(join(process.cwd(), "app", "api", "notebooks"));

    for (const file of notebookFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("@/lib/faculty");
    }
  });
});

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
