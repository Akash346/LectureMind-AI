import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  generateFacultyStructuredJson,
  getFacultyStructuredOutputLogFields
} from "@/lib/faculty/models";
import {
  FACULTY_BIAS_REPORT_SYSTEM_PROMPT,
  FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT,
  FacultyBiasReportSchema,
  FacultyImprovementReportSchema
} from "@/lib/faculty/prompts";
import { retrieveFacultyEvidence, type FacultyEvidence } from "@/lib/faculty/retrieval";
import { assertFacultySession, touchFacultySession } from "@/lib/faculty/session";
import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";
import { prisma } from "@/lib/prisma";

const REPORT_QUERIES = {
  improvement:
    "learning objectives clarity cognitive load examples active learning transitions recap accessibility",
  bias:
    "bias representation assumptions gender culture disability western AI fairness harm source diversity"
};

export async function generateFacultyImprovementReport(sessionId: string) {
  return generateFacultyReport({
    sessionId,
    artifactType: "improvement_report",
    operation: "faculty_improvement_report",
    systemPrompt: FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT,
    query: REPORT_QUERIES.improvement,
    schema: FacultyImprovementReportSchema,
    outputName: "improvement_report"
  });
}

export async function generateFacultyBiasReport(sessionId: string) {
  return generateFacultyReport({
    sessionId,
    artifactType: "bias_report",
    operation: "faculty_bias_report",
    systemPrompt: FACULTY_BIAS_REPORT_SYSTEM_PROMPT,
    query: REPORT_QUERIES.bias,
    schema: FacultyBiasReportSchema,
    outputName: "bias_report"
  });
}

async function generateFacultyReport<TSchema extends z.ZodTypeAny>(input: {
  sessionId: string;
  artifactType: string;
  operation: "faculty_improvement_report" | "faculty_bias_report";
  systemPrompt: string;
  query: string;
  schema: TSchema;
  outputName: string;
}) {
  await assertFacultySession(input.sessionId);
  await touchFacultySession(input.sessionId);

  const artifact = await prisma.facultyArtifact.upsert({
    where: {
      sessionId_type: {
        sessionId: input.sessionId,
        type: input.artifactType
      }
    },
    create: {
      sessionId: input.sessionId,
      type: input.artifactType,
      status: "running"
    },
    update: {
      status: "running",
      errorCode: null,
      errorMessage: null
    }
  });

  try {
    logFacultyEvent("faculty_report_started", {
      sessionId: input.sessionId,
      type: input.artifactType
    });
    const evidence = await retrieveFacultyEvidence({
      sessionId: input.sessionId,
      query: input.query,
      topK: 16,
      sourceTypes: ["lecture"]
    });

    if (evidence.length === 0) {
      throw new Error("No Faculty lecture evidence is available for the report.");
    }

    const { data: parsed, generated } = await generateFacultyStructuredJson({
      sessionId: input.sessionId,
      operation: input.operation,
      outputName: input.outputName,
      schema: input.schema,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: input.systemPrompt
        },
        {
          role: "user",
          content: buildReportUserPrompt(evidence)
        }
      ]
    });
    const completed = await prisma.facultyArtifact.update({
      where: { id: artifact.id },
      data: {
        status: "complete",
        title:
          input.artifactType === "bias_report"
            ? "Bias Report"
            : "Improvement Report",
        json: parsed as Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null
      }
    });

    logFacultyEvent("faculty_report_complete", {
      sessionId: input.sessionId,
      type: input.artifactType,
      artifactId: completed.id,
      deployment: generated.deployment
    });

    return {
      artifactId: completed.id,
      status: "complete" as const,
      report: parsed
    };
  } catch (error) {
    logFacultyError("faculty_error", error, {
      sessionId: input.sessionId,
      type: input.artifactType,
      ...getFacultyStructuredOutputLogFields(error)
    });
    await prisma.facultyArtifact.update({
      where: { id: artifact.id },
      data: {
        status: "failed",
        errorCode: "FACULTY_REPORT_FAILED",
        errorMessage: error instanceof Error ? error.message : "Report failed."
      }
    });
    throw error;
  }
}

function buildReportUserPrompt(evidence: FacultyEvidence[]) {
  return [
    "Analyze only this Faculty session evidence. Use citation references exactly as provided.",
    "",
    "Evidence:",
    ...evidence.map((item) =>
      [
        `[${item.reference}] ${item.timestamp ? `timestamp ${item.timestamp}` : ""}`,
        item.text
      ].join("\n")
    )
  ].join("\n\n");
}
