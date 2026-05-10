import { NextResponse } from "next/server";
import { z } from "zod";

import { listArtifacts } from "@/lib/ai/artifact-orchestrator";
import { getApiUser } from "@/lib/api-auth";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

export async function GET(
  request: Request,
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

  const url = new URL(request.url);
  const language = url.searchParams.get("language") ?? "en";
  const artifacts = await listArtifacts({
    notebookId: parsedParams.data.notebookId,
    userId: user.id,
    language
  });

  if (!artifacts) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  return NextResponse.json({
    notebookId: parsedParams.data.notebookId,
    language,
    artifacts
  });
}
