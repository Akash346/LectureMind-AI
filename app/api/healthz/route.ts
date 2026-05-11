import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const ingestionEngine = getIngestionEngine();
  const workerUrlConfigured = Boolean(
    process.env.LECTUREMIND_WORKER_URL?.trim() ||
      process.env.PYTHON_WORKER_URL?.trim()
  );

  return NextResponse.json(
    {
      ok: true,
      app: "lecturemind",
      ingestion: {
        ingestionEngine,
        workerEnabled: process.env.ENABLE_YTDLP_WORKER !== "false",
        workerUrlConfigured,
        azureSpeechFallbackEnabled:
          process.env.ENABLE_AZURE_SPEECH_FALLBACK !== "false"
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

function getIngestionEngine() {
  const value = process.env.INGESTION_ENGINE?.trim().toLowerCase();

  if (value === "node" || value === "worker" || value === "hybrid") {
    return value;
  }

  return "hybrid";
}
