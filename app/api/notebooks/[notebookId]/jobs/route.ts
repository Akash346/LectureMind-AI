import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUser } from "@/lib/api-auth";
import { jobTypes, type JobType } from "@/lib/jobs/job-types";
import { listNotebookJobs } from "@/lib/jobs/job-store";

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

  const type = new URL(request.url).searchParams.get("type") ?? undefined;
  const jobs = await listNotebookJobs({
    notebookId: parsedParams.data.notebookId,
    userId: user.id,
    type: isKnownJobType(type) ? type : undefined
  });

  return NextResponse.json({
    notebookId: parsedParams.data.notebookId,
    jobs
  });
}

function isKnownJobType(value: string | undefined): value is JobType {
  return Boolean(value && (jobTypes as readonly string[]).includes(value));
}
