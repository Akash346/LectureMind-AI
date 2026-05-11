import { NextResponse } from "next/server";
import { z } from "zod";

import { answerFacultyChat } from "@/lib/faculty/chat";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().trim().min(1)
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty chat request." }, { status: 400 });
  }

  try {
    const result = await answerFacultyChat(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Faculty chat failed."
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
