import { NextResponse } from "next/server";
import { z } from "zod";

import { generateFacultyImprovementReport } from "@/lib/faculty/reports";

const bodySchema = z.object({
  sessionId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty report request." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await generateFacultyImprovementReport(parsed.data.sessionId)
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report failed." },
      { status: 503 }
    );
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
