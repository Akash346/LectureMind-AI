import { randomUUID } from "crypto";
import type { FacultySession } from "@prisma/client";

import { getFacultyConfig } from "@/lib/config/server-env";
import { logFacultyEvent } from "@/lib/faculty/logger";
import { prisma } from "@/lib/prisma";

export function getFacultyNamespace(sessionId: string): string {
  return `faculty_${sessionId}`;
}

export async function touchFacultySession(sessionId: string): Promise<void> {
  const now = new Date();
  const data: {
    lastActiveAt: Date;
    expiresAt?: Date;
  } = {
    lastActiveAt: now
  };

  if (shouldExtendExpiryOnHeartbeat()) {
    data.expiresAt = getFacultyExpiresAt(now);
  }

  await prisma.facultySession.updateMany({
    where: {
      id: sessionId,
      deletedAt: null
    },
    data
  });
}

export async function assertFacultySession(
  sessionId: string
): Promise<FacultySession> {
  const session = await prisma.facultySession.findFirst({
    where: {
      id: sessionId,
      deletedAt: null
    }
  });

  if (!session) {
    throw new Error("Faculty session not found.");
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw new Error("Faculty session has expired.");
  }

  return session;
}

export async function createFacultySession(input: {
  lectureUrl?: string;
}): Promise<FacultySession> {
  const sessionId = createFacultyId("fac");
  const workspaceId = createFacultyId("fws");
  const now = new Date();
  const expiresAt = getFacultyExpiresAt(now);
  const azureNamespace = getFacultyNamespace(sessionId);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.facultySession.create({
      data: {
        id: sessionId,
        workspaceId,
        lectureUrl: input.lectureUrl,
        azureNamespace,
        status: "created",
        lastActiveAt: now,
        expiresAt
      }
    });

    await tx.facultyWorkspace.create({
      data: {
        id: workspaceId,
        sessionId,
        lectureUrl: input.lectureUrl ?? "",
        status: "pending"
      }
    });

    return created;
  });

  logFacultyEvent("faculty_session_created", {
    sessionId: session.id,
    workspaceId,
    azureNamespace,
    expiresAt: expiresAt.toISOString()
  });

  return session;
}

function getFacultyExpiresAt(from: Date) {
  const ttlMinutes = getFacultyConfig().sessionTtlMinutes;

  return new Date(from.getTime() + ttlMinutes * 60_000);
}

function shouldExtendExpiryOnHeartbeat() {
  return process.env.FACULTY_EXTEND_EXPIRY_ON_HEARTBEAT === "true";
}

function createFacultyId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
