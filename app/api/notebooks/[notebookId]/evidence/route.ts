import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid notebook." }, { status: 400 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: parsedParams.data.notebookId,
      userId: user.id
    },
    select: {
      id: true
    }
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  const evidence = await prisma.evidenceSegment.findMany({
    where: {
      notebookId: notebook.id
    },
    orderBy: {
      startSec: "asc"
    },
    select: {
      id: true,
      videoId: true,
      startSec: true,
      endSec: true,
      text: true,
      sourceType: true,
      confidence: true,
      language: true,
      extractionEngine: true,
      rawSource: true
    }
  });

  return NextResponse.json({
    notebookId: notebook.id,
    evidence
  });
}
