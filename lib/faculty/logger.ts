export type FacultyLogEvent =
  | "faculty_session_created"
  | "faculty_lecture_ingest_started"
  | "faculty_lecture_ingest_complete"
  | "faculty_index_started"
  | "faculty_index_complete"
  | "faculty_retrieval_started"
  | "faculty_retrieval_complete"
  | "faculty_report_started"
  | "faculty_report_complete"
  | "faculty_model_output"
  | "faculty_model_output_format_fallback"
  | "faculty_ocr_started"
  | "faculty_ocr_page_retry"
  | "faculty_ocr_complete"
  | "faculty_docx_created"
  | "faculty_cleanup_started"
  | "faculty_cleanup_complete"
  | "faculty_error";

type FacultyLogFields = Record<string, unknown> & {
  sessionId?: string;
};

export function logFacultyEvent(
  event: FacultyLogEvent,
  fields: FacultyLogFields = {}
) {
  console.info(
    "[faculty]",
    JSON.stringify({
      event,
      ...redactSensitiveFields(fields)
    })
  );
}

export function logFacultyError(
  event: FacultyLogEvent,
  error: unknown,
  fields: FacultyLogFields = {}
) {
  const diagnostics = getErrorDiagnostics(error);

  console.error(
    "[faculty]",
    JSON.stringify({
      event,
      ...redactSensitiveFields(fields),
      ...redactSensitiveFields(diagnostics),
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage:
        error instanceof Error ? sanitize(error.message) : "Unknown error"
    })
  );
}

function getErrorDiagnostics(error: unknown): FacultyLogFields {
  if (!error || typeof error !== "object") {
    return {};
  }

  const source = error as Record<string, unknown>;
  const diagnostics: FacultyLogFields = {};

  for (const key of [
    "parseStage",
    "responseFormat",
    "rawModelOutputFirst500Chars",
    "rawModelOutputLast200Chars"
  ]) {
    if (source[key] !== undefined) {
      diagnostics[key] = source[key];
    }
  }

  return diagnostics;
}

function redactSensitiveFields(fields: FacultyLogFields) {
  const redacted: FacultyLogFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (/key|secret|token|connection|string|transcript|document|content/i.test(key)) {
      redacted[key] = "[redacted]";
    } else if (typeof value === "string") {
      redacted[key] = sanitize(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

function sanitize(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 500);
}
