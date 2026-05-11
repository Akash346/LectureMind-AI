import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoProcessingError } from "@/lib/video-errors";
import { getWorkerUrl } from "@/lib/worker/client";

describe("worker client configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers LECTUREMIND_WORKER_URL", () => {
    vi.stubEnv("LECTUREMIND_WORKER_URL", "https://worker.example.com/");
    vi.stubEnv("PYTHON_WORKER_URL", "http://localhost:8000");

    expect(getWorkerUrl()).toBe("https://worker.example.com");
  });

  it("keeps PYTHON_WORKER_URL as a legacy alias", () => {
    vi.stubEnv("LECTUREMIND_WORKER_URL", "");
    vi.stubEnv("PYTHON_WORKER_URL", "http://localhost:8001/");

    expect(getWorkerUrl()).toBe("http://localhost:8001");
  });

  it("fails clearly when production has no worker URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LECTUREMIND_WORKER_URL", "");
    vi.stubEnv("PYTHON_WORKER_URL", "");

    expect(() => getWorkerUrl()).toThrowError(VideoProcessingError);
  });
});
