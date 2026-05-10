import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUser } from "@/lib/api-auth";
import { getJobForUser } from "@/lib/jobs/job-store";

const paramsSchema = z.object({
  jobId: z.string().min(1)
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid job." }, { status: 400 });
  }

  const job = await getJobForUser(parsedParams.data.jobId, user.id);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ job });
}
