import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("faculty routes", () => {
  it("creates all required Faculty API routes", () => {
    for (const route of [
      "session/route.ts",
      "session/[sessionId]/heartbeat/route.ts",
      "lecture/ingest/route.ts",
      "workspace/[sessionId]/status/route.ts",
      "chat/route.ts",
      "reports/improvement/route.ts",
      "reports/bias/route.ts",
      "reports/accessibility/route.ts",
      "upload/route.ts",
      "download/[artifactId]/route.ts",
      "signout/route.ts",
      "health/route.ts",
      "sweep/route.ts"
    ]) {
      expect(existsSync(join(process.cwd(), "app", "api", "faculty", ...route.split("/")))).toBe(true);
    }
  });

  it("creates Faculty pages", () => {
    expect(existsSync(join(process.cwd(), "app", "faculty", "dashboard", "page.tsx"))).toBe(true);
    expect(
      existsSync(
        join(process.cwd(), "app", "faculty", "workspace", "[sessionId]", "page.tsx")
      )
    ).toBe(true);
  });

  it("Student ingestion route source stays snapshot protected", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "app",
        "api",
        "notebooks",
        "[notebookId]",
        "process",
        "route.ts"
      ),
      "utf8"
    );

    expect(source).toMatchSnapshot();
  });

  it("Faculty API files do not live under Student notebooks routes", () => {
    const files = listFiles(join(process.cwd(), "app", "api", "notebooks"));
    expect(files.some((file) => file.includes("faculty"))).toBe(false);
  });
});

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
