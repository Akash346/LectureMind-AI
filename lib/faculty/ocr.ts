import { PDFDocument } from "pdf-lib";

import { getFacultyConfig } from "@/lib/config/server-env";
import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";
import { assertMistralOnlyForOcr } from "@/lib/faculty/models";
import { withFacultyRetry } from "@/lib/faculty/retry";

const MAX_MISTRAL_BYTES = 30 * 1024 * 1024;
const MAX_PAGES_PER_CHUNK = 25;
const LOW_CONFIDENCE_THRESHOLD = 0.75;

export type FacultyOcrPage = {
  pageNumber: number;
  text: string;
  confidence?: number;
  blocks?: Array<{
    type: "text" | "table" | "image" | "handwriting";
    text?: string;
    confidence?: number;
    boundingBox?: unknown;
  }>;
};

export type FacultyOcrResult = {
  pages: FacultyOcrPage[];
  fullText: string;
  averageConfidence?: number;
};

type OcrChunk = {
  bytes: Buffer;
  mimeType: string;
  pageOffset: number;
  pageCount?: number;
};

type MistralOcrResponse = {
  pages?: Array<{
    index?: number;
    markdown?: string;
    images?: unknown[];
    tables?: unknown[];
    confidence_scores?: {
      average_page_confidence_score?: number;
      minimum_page_confidence_score?: number;
    } | null;
  }>;
  usage_info?: unknown;
};

export async function runFacultyOcr(input: {
  sessionId: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<FacultyOcrResult & { rawJson: unknown }> {
  assertMistralOnlyForOcr("faculty_ocr");

  if (input.bytes.length > MAX_MISTRAL_BYTES) {
    throw new Error("Faculty accessibility uploads must be under 30MB.");
  }

  logFacultyEvent("faculty_ocr_started", {
    sessionId: input.sessionId,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length
  });

  const chunks = await createOcrChunks(input.bytes, input.mimeType);
  const rawChunks: unknown[] = [];
  const pages: FacultyOcrPage[] = [];

  for (const chunk of chunks) {
    const response = await processOcrChunkWithConfidenceRetries({
      sessionId: input.sessionId,
      chunk
    });
    rawChunks.push(response);
    pages.push(...mapMistralPages(response, chunk.pageOffset));
  }

  const sortedPages = pages.sort((a, b) => a.pageNumber - b.pageNumber);
  const confidenceValues = sortedPages
    .map((page) => page.confidence)
    .filter((value): value is number => typeof value === "number");
  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) /
        confidenceValues.length
      : undefined;
  const fullText = sortedPages.map((page) => page.text).join("\n\n");

  logFacultyEvent("faculty_ocr_complete", {
    sessionId: input.sessionId,
    pageCount: sortedPages.length,
    averageConfidence
  });

  return {
    pages: sortedPages,
    fullText,
    averageConfidence,
    rawJson: {
      chunks: rawChunks
    }
  };
}

async function createOcrChunks(
  bytes: Buffer,
  mimeType: string
): Promise<OcrChunk[]> {
  if (mimeType === "application/pdf") {
    const sourcePdf = await PDFDocument.load(bytes);
    const pageCount = sourcePdf.getPageCount();
    const chunks: OcrChunk[] = [];

    for (let start = 0; start < pageCount; start += MAX_PAGES_PER_CHUNK) {
      const end = Math.min(start + MAX_PAGES_PER_CHUNK, pageCount);
      const chunkPdf = await PDFDocument.create();
      const copiedPages = await chunkPdf.copyPages(
        sourcePdf,
        Array.from({ length: end - start }, (_, index) => start + index)
      );

      copiedPages.forEach((page) => chunkPdf.addPage(page));
      const chunkBytes = Buffer.from(await chunkPdf.save());

      if (chunkBytes.length > MAX_MISTRAL_BYTES) {
        throw new Error("A Faculty OCR chunk exceeds the 30MB Mistral limit.");
      }

      chunks.push({
        bytes: chunkBytes,
        mimeType,
        pageOffset: start,
        pageCount: end - start
      });
    }

    return chunks;
  }

  if (bytes.length > MAX_MISTRAL_BYTES) {
    throw new Error("A Faculty OCR chunk exceeds the 30MB Mistral limit.");
  }

  return [
    {
      bytes,
      mimeType,
      pageOffset: 0
    }
  ];
}

async function processOcrChunkWithConfidenceRetries(input: {
  sessionId: string;
  chunk: OcrChunk;
}) {
  let response: MistralOcrResponse | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await withFacultyRetry({
      operation: "faculty_ocr",
      sessionId: input.sessionId,
      maxAttempts: 1,
      run: () => callMistralOcr(input.chunk)
    });

    const confidence = getAverageChunkConfidence(response);

    if (confidence === undefined || confidence >= LOW_CONFIDENCE_THRESHOLD) {
      return response;
    }

    if (attempt < 3) {
      logFacultyEvent("faculty_ocr_page_retry", {
        sessionId: input.sessionId,
        pageOffset: input.chunk.pageOffset,
        pageCount: input.chunk.pageCount,
        confidence,
        attempt
      });
      await sleep(300 * 2 ** attempt);
    }
  }

  return response ?? { pages: [] };
}

async function callMistralOcr(chunk: OcrChunk): Promise<MistralOcrResponse> {
  const config = getFacultyConfig();

  if (!config.mistralOcrEndpoint || !config.mistralOcrApiKey) {
    throw new Error("Mistral OCR is not configured.");
  }

  const dataUrl = `data:${chunk.mimeType};base64,${chunk.bytes.toString("base64")}`;
  const response = await fetch(config.mistralOcrEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.mistralOcrApiKey}`
    },
    body: JSON.stringify({
      model: config.mistralOcrModel,
      document: {
        type: "document_url",
        document_url: dataUrl
      },
      include_image_base64: true,
      table_format: "html",
      extract_header: true,
      extract_footer: true
    }),
    signal: AbortSignal.timeout(120_000)
  });

  if (!response.ok) {
    const text = await response.text();
    logFacultyError("faculty_error", new Error(text), {
      operation: "faculty_ocr",
      status: response.status
    });
    throw new Error(`Mistral OCR failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as MistralOcrResponse;
}

function mapMistralPages(
  response: MistralOcrResponse,
  pageOffset: number
): FacultyOcrPage[] {
  return (response.pages ?? []).map((page, index) => {
    const confidence =
      page.confidence_scores?.average_page_confidence_score ??
      page.confidence_scores?.minimum_page_confidence_score ??
      undefined;

    return {
      pageNumber: pageOffset + (page.index ?? index) + 1,
      text: page.markdown ?? "",
      confidence,
      blocks: [
        {
          type: "text",
          text: page.markdown ?? "",
          confidence
        },
        ...(page.tables ?? []).map((table) => ({
          type: "table" as const,
          text: JSON.stringify(table),
          boundingBox: table
        })),
        ...(page.images ?? []).map((image) => ({
          type: "image" as const,
          boundingBox: image
        }))
      ]
    };
  });
}

function getAverageChunkConfidence(response: MistralOcrResponse) {
  const values = (response.pages ?? [])
    .map(
      (page) =>
        page.confidence_scores?.average_page_confidence_score ??
        page.confidence_scores?.minimum_page_confidence_score
    )
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
