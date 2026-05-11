import { Prisma } from "@prisma/client";

import { createAccessibleDocx } from "@/lib/faculty/docx";
import { indexFacultyDocument } from "@/lib/faculty/indexing";
import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";
import {
  generateFacultyStructuredJson,
  getFacultyStructuredOutputLogFields
} from "@/lib/faculty/models";
import { runFacultyOcr } from "@/lib/faculty/ocr";
import {
  FACULTY_ACCESSIBILITY_REMEDIATION_SYSTEM_PROMPT,
  FacultyAccessibilityRemediationSchema
} from "@/lib/faculty/prompts";
import { assertFacultySession, touchFacultySession } from "@/lib/faculty/session";
import {
  downloadFacultyBlob,
  getFacultyArtifactStorageKey,
  uploadFacultyBlob
} from "@/lib/faculty/storage";
import { prisma } from "@/lib/prisma";

export async function generateFacultyAccessibilityReport(input: {
  sessionId: string;
  uploadId: string;
}) {
  await assertFacultySession(input.sessionId);
  await touchFacultySession(input.sessionId);

  const upload = await prisma.facultyUpload.findFirst({
    where: {
      id: input.uploadId,
      sessionId: input.sessionId
    }
  });

  if (!upload) {
    throw new Error("Faculty upload not found.");
  }

  const reportArtifact = await prisma.facultyArtifact.upsert({
    where: {
      sessionId_type: {
        sessionId: input.sessionId,
        type: "accessibility_report"
      }
    },
    create: {
      sessionId: input.sessionId,
      type: "accessibility_report",
      status: "running",
      title: "Accessibility Report"
    },
    update: {
      status: "running",
      errorCode: null,
      errorMessage: null
    }
  });
  const docxArtifact = await prisma.facultyArtifact.upsert({
    where: {
      sessionId_type: {
        sessionId: input.sessionId,
        type: "accessibility_docx"
      }
    },
    create: {
      sessionId: input.sessionId,
      type: "accessibility_docx",
      status: "running",
      title: "Accessible DOCX"
    },
    update: {
      status: "running",
      errorCode: null,
      errorMessage: null
    }
  });

  try {
    await prisma.facultyUpload.update({
      where: { id: upload.id },
      data: { ocrStatus: "ocr" }
    });

    const source = await downloadFacultyBlob(upload.storageKey);
    const ocr = await runFacultyOcr({
      sessionId: input.sessionId,
      bytes: source.buffer,
      mimeType: upload.mimeType
    });

    await prisma.facultyUpload.update({
      where: { id: upload.id },
      data: {
        ocrStatus: "remediating",
        ocrText: ocr.fullText,
        ocrJson: ocr.rawJson as Prisma.InputJsonValue,
        confidenceScore: ocr.averageConfidence
      }
    });

    await indexFacultyDocument({
      sessionId: input.sessionId,
      uploadId: upload.id,
      chunks: ocr.pages.map((page) => ({
        id: `page_${page.pageNumber}`,
        text: page.text,
        pageNumber: page.pageNumber,
        heading: upload.originalName
      }))
    });

    const { data: remediation } = await generateFacultyStructuredJson({
      sessionId: input.sessionId,
      operation: "faculty_accessibility_remediation",
      outputName: "accessibility_remediation",
      schema: FacultyAccessibilityRemediationSchema,
      temperature: 0.1,
      timeoutMs: 120_000,
      messages: [
        {
          role: "system",
          content: FACULTY_ACCESSIBILITY_REMEDIATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify({
            originalName: upload.originalName,
            mimeType: upload.mimeType,
            pages: ocr.pages
          })
        }
      ]
    });
    const docxBuffer = await createAccessibleDocx({
      sessionId: input.sessionId,
      remediation
    });
    const docxStorageKey = getFacultyArtifactStorageKey({
      sessionId: input.sessionId,
      artifactId: docxArtifact.id,
      extension: "docx"
    });

    await uploadFacultyBlob({
      storageKey: docxStorageKey,
      bytes: docxBuffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    await prisma.$transaction([
      prisma.facultyArtifact.update({
        where: { id: reportArtifact.id },
        data: {
          status: "complete",
          json: remediation as Prisma.InputJsonValue,
          errorCode: null,
          errorMessage: null
        }
      }),
      prisma.facultyArtifact.update({
        where: { id: docxArtifact.id },
        data: {
          status: "complete",
          storageKey: docxStorageKey,
          errorCode: null,
          errorMessage: null
        }
      }),
      prisma.facultyUpload.update({
        where: { id: upload.id },
        data: {
          ocrStatus: "complete"
        }
      })
    ]);

    logFacultyEvent("faculty_report_complete", {
      sessionId: input.sessionId,
      type: "accessibility",
      reportArtifactId: reportArtifact.id,
      docxArtifactId: docxArtifact.id
    });

    return {
      artifactId: reportArtifact.id,
      status: "complete" as const,
      reportArtifactId: reportArtifact.id,
      docxArtifactId: docxArtifact.id
    };
  } catch (error) {
    logFacultyError("faculty_error", error, {
      sessionId: input.sessionId,
      type: "accessibility",
      ...getFacultyStructuredOutputLogFields(error)
    });
    await prisma.$transaction([
      prisma.facultyArtifact.update({
        where: { id: reportArtifact.id },
        data: {
          status: "failed",
          errorCode: "FACULTY_ACCESSIBILITY_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Accessibility failed."
        }
      }),
      prisma.facultyArtifact.update({
        where: { id: docxArtifact.id },
        data: {
          status: "failed",
          errorCode: "FACULTY_ACCESSIBILITY_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Accessibility failed."
        }
      }),
      prisma.facultyUpload.update({
        where: { id: upload.id },
        data: {
          ocrStatus: "failed"
        }
      })
    ]);
    throw error;
  }
}
