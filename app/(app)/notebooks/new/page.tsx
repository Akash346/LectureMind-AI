import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppTopBar } from "@/components/app-shell";
import { NewNotebookForm } from "@/components/new-notebook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function NewNotebookPage() {
  const user = await requireUser();
  const preference = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { defaultLanguage: true }
  });

  return (
    <main className="min-h-screen bg-muted/20">
      <AppTopBar user={user} />
      <section className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <Link
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div>
            <p className="text-sm font-medium text-primary">New notebook</p>
            <h1 className="mt-2 text-3xl font-semibold">
              Add a lecture source
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Paste a public YouTube lecture URL. LectureMind will create the
              workspace and save placeholder artifacts for Phase 2 processing.
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Lecture source</CardTitle>
            <CardDescription>
              No video processing or AI calls happen in Phase 1.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewNotebookForm
              defaultLanguage={preference?.defaultLanguage ?? "en"}
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
