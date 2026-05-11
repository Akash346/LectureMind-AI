export const videoErrorTypes = [
  "PRIVATE_VIDEO",
  "MEMBERS_ONLY",
  "LOGIN_REQUIRED",
  "VIDEO_UNAVAILABLE",
  "LIVE_STREAM_ACTIVE",
  "AGE_RESTRICTED",
  "REGION_BLOCKED",
  "NO_CAPTIONS",
  "TRANSCRIPT_UNAVAILABLE",
  "AUDIO_EXTRACTION_FAILED",
  "TRANSCRIPTION_FAILED",
  "UNSUPPORTED_URL",
  "VIDEO_TOO_LONG",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "WORKER_UNAVAILABLE",
  "UNKNOWN"
] as const;

export type VideoErrorType = (typeof videoErrorTypes)[number];

export type VideoErrorCopy = {
  userTitle: string;
  userMessage: string;
  retryable: boolean;
  examples?: string[];
};

export const examplePublicLectureLinks = [
  "https://www.youtube.com/watch?v=PUBLIC_LECTURE_ID",
  "https://youtu.be/PUBLIC_LECTURE_ID",
  "https://www.youtube.com/shorts/PUBLIC_LECTURE_ID"
] as const;

export const unsupportedRestrictedVideoMessage =
  "LectureMind supports public educational YouTube videos. This video appears to be private, restricted, age restricted, unavailable, or requires sign in. Please try a public video with captions, or a public lecture video that can be processed.";

export const videoErrorCopy: Record<VideoErrorType, VideoErrorCopy> = {
  PRIVATE_VIDEO: {
    userTitle: "This video is private.",
    userMessage: unsupportedRestrictedVideoMessage,
    retryable: false,
    examples: [...examplePublicLectureLinks]
  },
  MEMBERS_ONLY: {
    userTitle: "This video is restricted.",
    userMessage: unsupportedRestrictedVideoMessage,
    retryable: false,
    examples: [...examplePublicLectureLinks]
  },
  LOGIN_REQUIRED: {
    userTitle: "This video requires sign-in.",
    userMessage: unsupportedRestrictedVideoMessage,
    retryable: false,
    examples: [...examplePublicLectureLinks]
  },
  VIDEO_UNAVAILABLE: {
    userTitle: "This video is unavailable.",
    userMessage: unsupportedRestrictedVideoMessage,
    retryable: false,
    examples: [...examplePublicLectureLinks]
  },
  LIVE_STREAM_ACTIVE: {
    userTitle: "Livestreams are not supported yet.",
    userMessage:
      "Wait until the stream ends and YouTube finishes processing captions.",
    retryable: true
  },
  AGE_RESTRICTED: {
    userTitle: "This video requires sign-in.",
    userMessage: unsupportedRestrictedVideoMessage,
    retryable: false
  },
  REGION_BLOCKED: {
    userTitle: "This video is not available in this region.",
    userMessage: unsupportedRestrictedVideoMessage,
    retryable: false
  },
  NO_CAPTIONS: {
    userTitle: "No transcript is available yet.",
    userMessage: "The video did not provide usable captions.",
    retryable: false
  },
  TRANSCRIPT_UNAVAILABLE: {
    userTitle: "No transcript is available yet.",
    userMessage: "Captions were found, but they could not be read safely.",
    retryable: true
  },
  AUDIO_EXTRACTION_FAILED: {
    userTitle: "We could not extract audio from this video.",
    userMessage: "Try another public lecture or a video with captions.",
    retryable: true
  },
  TRANSCRIPTION_FAILED: {
    userTitle: "Speech transcription failed.",
    userMessage:
      "The video did not provide captions, and audio transcription could not complete.",
    retryable: true
  },
  UNSUPPORTED_URL: {
    userTitle: "That link is not a supported YouTube video.",
    userMessage:
      "Paste a public YouTube watch, short, live, or youtu.be lecture link.",
    retryable: false
  },
  VIDEO_TOO_LONG: {
    userTitle: "This lecture is too long for this build.",
    userMessage: "Try a lecture under 3 hours while we keep processing reliable.",
    retryable: false
  },
  RATE_LIMITED: {
    userTitle: "YouTube asked us to slow down.",
    userMessage: "Please retry in a few minutes.",
    retryable: true
  },
  NETWORK_ERROR: {
    userTitle: "We could not reach YouTube.",
    userMessage: "Check the URL or try again shortly.",
    retryable: true
  },
  WORKER_UNAVAILABLE: {
    userTitle: "Advanced processing is temporarily unavailable.",
    userMessage: "Lecture captions may still work. Try again in a moment.",
    retryable: true
  },
  UNKNOWN: {
    userTitle: "We could not process this video.",
    userMessage:
      "Try another public lecture URL. The failure was captured safely.",
    retryable: false
  }
};

export class VideoProcessingError extends Error {
  readonly type: VideoErrorType;
  readonly userTitle: string;
  readonly userMessage: string;
  readonly technicalMessage?: string;
  readonly retryable: boolean;
  readonly examples?: string[];

  constructor({
    type,
    technicalMessage,
    retryable,
    userTitle,
    userMessage,
    examples
  }: {
    type: VideoErrorType;
    technicalMessage?: string;
    retryable?: boolean;
    userTitle?: string;
    userMessage?: string;
    examples?: string[];
  }) {
    const copy = videoErrorCopy[type];

    super(userTitle ?? copy.userTitle);
    this.name = "VideoProcessingError";
    this.type = type;
    this.userTitle = userTitle ?? copy.userTitle;
    this.userMessage = userMessage ?? copy.userMessage;
    this.technicalMessage = technicalMessage;
    this.retryable = retryable ?? copy.retryable;
    this.examples = examples ?? copy.examples;
  }
}

export function isVideoProcessingError(
  error: unknown
): error is VideoProcessingError {
  return error instanceof VideoProcessingError;
}

export function createVideoError(
  type: VideoErrorType,
  technicalMessage?: string
) {
  return new VideoProcessingError({ type, technicalMessage });
}

export function normalizeVideoError(error: unknown): VideoProcessingError {
  if (isVideoProcessingError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new VideoProcessingError({
      type: "UNKNOWN",
      technicalMessage: error.message
    });
  }

  return new VideoProcessingError({
    type: "UNKNOWN",
    technicalMessage: "Unknown non-Error throw"
  });
}

export function serializeVideoError(error: VideoProcessingError) {
  return {
    type: error.type,
    userTitle: error.userTitle,
    userMessage: error.userMessage,
    retryable: error.retryable,
    examples: error.examples
  };
}
