import { FacultyWorkspace } from "@/components/faculty/FacultyWorkspace";

export default async function FacultyWorkspacePage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return <FacultyWorkspace sessionId={sessionId} />;
}
