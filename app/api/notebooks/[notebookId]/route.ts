import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getApiUser } from "@/lib/api-auth";
import { deleteNotebookForUser } from "@/lib/notebooks/delete-notebook";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid notebook." },
      { status: 400 }
    );
  }

  const user = await getApiUser();
  const result = await deleteNotebookForUser({
    notebookId: parsedParams.data.notebookId,
    userId: user?.id ?? null
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status }
    );
  }

  revalidatePath("/dashboard");

  return NextResponse.json({
    ok: true,
    notebookId: result.notebookId,
    deletedCounts: result.deletedCounts
  });
}
