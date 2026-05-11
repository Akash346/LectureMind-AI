import { NextResponse } from "next/server";

import { assertFacultySession } from "@/lib/faculty/session";
import {
  getFacultyUploadStorageKey,
  uploadFacultyBlob
} from "@/lib/faculty/storage";
import { prisma } from "@/lib/prisma";

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "application/x-zip-compressed"
]);
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData();
  const sessionId = String(formData.get("sessionId") ?? "");
  const file = formData.get("file");

  if (!sessionId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing Faculty upload fields." }, { status: 400 });
  }

  await assertFacultySession(sessionId);

  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Upload a PDF or DOCX file." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Faculty uploads must be under 30MB." }, { status: 400 });
  }

  const upload = await prisma.facultyUpload.create({
    data: {
      sessionId,
      originalName: file.name,
      mimeType: normalizeMimeType(file),
      sizeBytes: file.size,
      storageKey: "pending"
    }
  });
  const storageKey = getFacultyUploadStorageKey({
    sessionId,
    uploadId: upload.id
  });
  const bytes = Buffer.from(await file.arrayBuffer());

  await uploadFacultyBlob({
    storageKey,
    bytes,
    contentType: normalizeMimeType(file)
  });
  await prisma.facultyUpload.update({
    where: { id: upload.id },
    data: { storageKey }
  });

  return NextResponse.json({
    uploadId: upload.id,
    originalName: file.name,
    mimeType: normalizeMimeType(file),
    sizeBytes: file.size
  });
}

function normalizeMimeType(file: File) {
  if (file.name.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return file.type || "application/pdf";
}
