import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { AppTopBar } from "@/components/app-shell";
import { DeleteNotebookDialog } from "@/components/delete-notebook-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { logAuthDebug } from "@/lib/auth-debug";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

const statusVariant = {
  DRAFT: "secondary",
  PENDING: "warning",
  PROCESSING: "warning",
  READY: "success",
  FAILED: "destructive"
} as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const notebooks = await prisma.notebook.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      title: true,
      sourceUrl: true,
      status: true,
      createdAt: true
    }
  });

  logAuthDebug("dashboard_notebooks_loaded", {
    sessionUserId: user.id,
    notebookOwnerIds: Array.from(
      new Set(notebooks.map((notebook) => notebook.userId))
    ),
    notebookCount: notebooks.length
  });

  return (
    <main className="min-h-screen bg-muted/20">
      <AppTopBar user={user} />
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-primary">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">Your notebooks</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a study workspace from a public YouTube lecture.
            </p>
          </div>
          <Button asChild>
            <Link href="/notebooks/new">
              <Plus className="h-4 w-4" />
              New notebook
            </Link>
          </Button>
        </div>

        {notebooks.length === 0 ? (
          <Card className="mt-8 border-dashed">
            <CardContent className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">
                Start with one lecture
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Phase 1 creates the notebook shell and queues future ingestion
                work without calling any AI services.
              </p>
              <Button asChild className="mt-6">
                <Link href="/notebooks/new">Create notebook</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {notebooks.map((notebook) => (
              <Card key={notebook.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        <Link
                          className="hover:text-primary"
                          href={`/notebooks/${notebook.id}`}
                        >
                          {notebook.title}
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        {formatDate(notebook.createdAt)}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        statusVariant[notebook.status] === "destructive"
                          ? "outline"
                          : statusVariant[notebook.status]
                      }
                    >
                      {notebook.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 break-all text-sm text-muted-foreground">
                    {notebook.sourceUrl}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/notebooks/${notebook.id}`}>Open</Link>
                    </Button>
                    <DeleteNotebookDialog
                      notebookId={notebook.id}
                      title={notebook.title}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
