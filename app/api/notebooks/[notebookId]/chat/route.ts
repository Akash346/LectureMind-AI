import { NextResponse } from "next/server";
import { z } from "zod";

import { answerNotebookChat } from "@/lib/chat/chat-service";
import { checkChatRateLimit } from "@/lib/chat/rate-limit";
import { getApiUser } from "@/lib/api-auth";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: { code: "INVALID_NOTEBOOK", message: "Invalid notebook." } },
      { status: 400 }
    );
  }

  const rateLimit = checkChatRateLimit({
    userId: user.id,
    notebookId: parsedParams.data.notebookId
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Please wait a moment before sending another chat message."
        }
      },
      {
        status: 429,
        headers: {
          "retry-after": String(
            Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))
          )
        }
      }
    );
  }

  const result = await answerNotebookChat({
    userId: user.id,
    notebookId: parsedParams.data.notebookId,
    body: await readJsonBody(request)
  });

  if (!result.ok) {
    return NextResponse.json(result.response, { status: result.status });
  }

  return NextResponse.json(result.response);
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
