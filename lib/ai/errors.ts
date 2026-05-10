export const aiErrorTypes = [
  "AI_NOT_CONFIGURED",
  "MODEL_TIMEOUT",
  "MODEL_RATE_LIMITED",
  "MODEL_BAD_JSON",
  "MODEL_SCHEMA_INVALID",
  "VERIFICATION_FAILED",
  "INSUFFICIENT_EVIDENCE",
  "ARTIFACT_UNKNOWN",
  "UNKNOWN"
] as const;

export type AIGenerationErrorType = (typeof aiErrorTypes)[number];

export type AIGenerationErrorCopy = {
  title: string;
  message: string;
};

export const aiErrorCopy: Record<AIGenerationErrorType, AIGenerationErrorCopy> =
  {
    AI_NOT_CONFIGURED: {
      title: "AI generation is not configured yet.",
      message:
        "Transcript processing is ready, but model credentials are missing."
    },
    INSUFFICIENT_EVIDENCE: {
      title: "Not enough lecture evidence.",
      message:
        "This video did not produce enough transcript evidence to generate this artifact reliably."
    },
    MODEL_TIMEOUT: {
      title: "Generation took too long.",
      message: "Try again. The transcript is saved, so you will not lose progress."
    },
    MODEL_RATE_LIMITED: {
      title: "The model is busy.",
      message: "Please retry in a moment."
    },
    MODEL_BAD_JSON: {
      title: "Generation format failed.",
      message: "LectureMind could not safely render this artifact. Try again."
    },
    MODEL_SCHEMA_INVALID: {
      title: "Generation format failed.",
      message: "LectureMind could not safely render this artifact. Try again."
    },
    VERIFICATION_FAILED: {
      title: "Could not verify this artifact.",
      message:
        "The generated content did not pass source-grounding checks."
    },
    ARTIFACT_UNKNOWN: {
      title: "Artifact generation failed.",
      message: "Try again. Your transcript evidence is still saved."
    },
    UNKNOWN: {
      title: "Artifact generation failed.",
      message: "Try again. Your transcript evidence is still saved."
    }
  };

export class AIGenerationError extends Error {
  readonly type: AIGenerationErrorType;
  readonly title: string;
  readonly userMessage: string;
  readonly technicalMessage?: string;
  readonly statusCode?: number;
  readonly providerCode?: string;

  constructor({
    type,
    technicalMessage,
    title,
    message,
    statusCode,
    providerCode
  }: {
    type: AIGenerationErrorType;
    technicalMessage?: string;
    title?: string;
    message?: string;
    statusCode?: number;
    providerCode?: string;
  }) {
    const copy = aiErrorCopy[type];

    super(title ?? copy.title);
    this.name = "AIGenerationError";
    this.type = type;
    this.title = title ?? copy.title;
    this.userMessage = message ?? copy.message;
    this.technicalMessage = technicalMessage;
    this.statusCode = statusCode;
    this.providerCode = providerCode;
  }
}

export function isAIGenerationError(
  error: unknown
): error is AIGenerationError {
  return error instanceof AIGenerationError;
}

export function normalizeAIGenerationError(error: unknown) {
  if (isAIGenerationError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AIGenerationError({
      type: "UNKNOWN",
      technicalMessage: error.message
    });
  }

  return new AIGenerationError({
    type: "UNKNOWN",
    technicalMessage: "Unknown non-Error throw"
  });
}
