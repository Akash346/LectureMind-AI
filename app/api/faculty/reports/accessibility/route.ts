import { NextResponse } from "next/server";
import { z } from "zod";

import { generateFacultyAccessibilityReport } from "@/lib/faculty/accessibility";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  uploadId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid accessibility request." }, { status: 400 });
  }

  try {
    return NextResponse.json(await generateFacultyAccessibilityReport(parsed.data));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Accessibility remediation failed."
      },
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
