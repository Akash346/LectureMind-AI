import type { ProcessNotebookVideoResult } from "@/lib/youtube/process-video";
import { processNotebookVideo } from "@/lib/youtube/process-video";

export type EnqueueNotebookProcessingInput = {
  notebookId: string;
  userId: string;
  force?: boolean;
};

export async function enqueueNotebookProcessing({
  notebookId,
  userId,
  force = false
}: EnqueueNotebookProcessingInput): Promise<ProcessNotebookVideoResult> {
  return processNotebookVideo(notebookId, userId, { force });
}
