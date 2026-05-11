import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;
const CIRCUIT_OPEN_MS = 30_000;
const FAILURE_THRESHOLD = 5;

const circuitState = new Map<
  string,
  {
    failures: number;
    openedAt: number | null;
  }
>();

export async function withFacultyRetry<T>(input: {
  operation: string;
  sessionId?: string;
  maxAttempts?: number;
  run: () => Promise<T>;
}): Promise<T> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logFacultyEvent("faculty_retrieval_started", {
        sessionId: input.sessionId,
        operation: input.operation,
        attempt
      });
      return await input.run();
    } catch (error) {
      lastError = error;
      logFacultyError("faculty_error", error, {
        sessionId: input.sessionId,
        operation: input.operation,
        attempt,
        maxAttempts
      });

      if (attempt === maxAttempts) {
        break;
      }

      await sleep(getBackoffMs(attempt));
    }
  }

  throw new Error(
    `${input.operation} failed after ${maxAttempts} attempts: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`
  );
}

export async function guardFacultyModelCall<T>(input: {
  operation: string;
  sessionId?: string;
  run: () => Promise<T>;
}): Promise<T> {
  const state = circuitState.get(input.operation) ?? {
    failures: 0,
    openedAt: null
  };

  if (state.openedAt && Date.now() - state.openedAt < CIRCUIT_OPEN_MS) {
    throw new Error(`Faculty model circuit is open for ${input.operation}.`);
  }

  if (state.openedAt) {
    state.openedAt = null;
    state.failures = 0;
  }

  try {
    const result = await input.run();
    circuitState.set(input.operation, { failures: 0, openedAt: null });
    return result;
  } catch (error) {
    const failures = state.failures + 1;
    circuitState.set(input.operation, {
      failures,
      openedAt: failures >= FAILURE_THRESHOLD ? Date.now() : null
    });
    logFacultyError("faculty_error", error, {
      sessionId: input.sessionId,
      operation: input.operation,
      circuitFailures: failures
    });
    throw error;
  }
}

function getBackoffMs(attempt: number) {
  const jitter = Math.floor(Math.random() * 100);

  return BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
