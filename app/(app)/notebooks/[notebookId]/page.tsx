import { redirect } from "next/navigation";

export default async function OldNotebookRedirect({
  params
}: {
  params: Promise<{ notebookId: string }>;
}) {
  const { notebookId } = await params;
  redirect(`/chats/${notebookId}`);
}
