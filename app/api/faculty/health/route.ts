import { NextResponse } from "next/server";

import { generateEmbeddings } from "@/lib/ai/embeddings";
import { getAzureOpenAIConfig, getFacultyConfig } from "@/lib/config/server-env";
import { getFacultySearchIndexName } from "@/lib/faculty/indexing";
import { isFacultyStorageContainerReachable } from "@/lib/faculty/storage";
import { searchFetch } from "@/lib/search/search-client";

export async function GET() {
  const [
    mistralOcr,
    primaryModel,
    embeddingModel,
    facultySearchIndex,
    facultyStorageContainer
  ] = await Promise.all([
    checkMistralOcr(),
    checkPrimaryModel(),
    checkEmbeddingModel(),
    checkFacultySearchIndex(),
    isFacultyStorageContainerReachable()
  ]);

  return NextResponse.json({
    ok: true,
    mistralOcr,
    primaryModel,
    embeddingModel,
    facultySearchIndex,
    facultyStorageContainer,
    timestamp: new Date().toISOString()
  });
}

async function checkPrimaryModel() {
  const azure = getAzureOpenAIConfig();
  const faculty = getFacultyConfig();
  const deployment =
    faculty.primaryModelDeployment ??
    azure.strongDeployment ??
    azure.fastDeployment;

  if (!azure.endpoint || !azure.apiKey || !deployment) {
    return false;
  }

  try {
    const response = await fetch(
      `${azure.endpoint}/openai/deployments/${encodeURIComponent(
        deployment
      )}/chat/completions?api-version=${encodeURIComponent(azure.apiVersion)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": azure.apiKey
        },
        body: JSON.stringify({
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Return JSON only."
            },
            {
              role: "user",
              content: "Return {\"ok\":true}."
            }
          ]
        }),
        signal: AbortSignal.timeout(30_000)
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

async function checkEmbeddingModel() {
  try {
    await generateEmbeddings(["LectureMind faculty health check"], {
      timeoutMs: 30_000,
      skipDimensionValidation: true
    });
    return true;
  } catch {
    return false;
  }
}

async function checkFacultySearchIndex() {
  try {
    await searchFetch({
      path: `/indexes/${encodeURIComponent(getFacultySearchIndexName())}`,
      method: "GET",
      operation: "query",
      timeoutMs: 15_000
    });
    return true;
  } catch {
    return false;
  }
}

async function checkMistralOcr() {
  const faculty = getFacultyConfig();

  if (!faculty.mistralOcrEndpoint || !faculty.mistralOcrApiKey) {
    return false;
  }

  try {
    const response = await fetch(faculty.mistralOcrEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${faculty.mistralOcrApiKey}`
      },
      body: JSON.stringify({
        model: faculty.mistralOcrModel,
        document: {
          type: "document_url",
          document_url: "data:application/pdf;base64,"
        }
      }),
      signal: AbortSignal.timeout(15_000)
    });

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return false;
    }

    return response.status < 500;
  } catch {
    return false;
  }
}
