"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassPanel, PageShell } from "@/components/ui/brand";
import { useFacultyStore } from "@/lib/faculty/store";

export function FacultyDashboard() {
  const router = useRouter();
  const lectureUrl = useFacultyStore((state) => state.lectureUrl);
  const setLectureUrl = useFacultyStore((state) => state.setLectureUrl);
  const setSession = useFacultyStore((state) => state.setSession);
  const setStatus = useFacultyStore((state) => state.setStatus);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    setStatus("creating");

    try {
      const sessionResponse = await fetch("/api/faculty/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lectureUrl })
      });
      const sessionPayload = await sessionResponse.json();

      if (!sessionResponse.ok) {
        throw new Error(sessionPayload.error ?? "Could not create Faculty session.");
      }

      setSession({
        sessionId: sessionPayload.sessionId,
        workspaceId: sessionPayload.workspaceId
      });
      window.localStorage.setItem("lecturemind_faculty_session", sessionPayload.sessionId);

      await fetch("/api/faculty/lecture/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionPayload.sessionId,
          lectureUrl
        })
      });

      setStatus("ingesting");
      router.push(`/faculty/workspace/${sessionPayload.sessionId}`);
    } catch (caught) {
      setStatus("failed");
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create Faculty workspace."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full max-w-xl"
        >
          <GlassPanel className="p-8 sm:p-10">
            <h1 className="font-space-grotesk text-3xl font-semibold">
              Faculty Lecture Review
            </h1>
            <p className="mt-4 leading-7 text-black/70 dark:text-white/70">
              Paste a lecture link to review delivery, fairness, and accessibility.
            </p>
            <form className="mt-8 space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="facultyLectureUrl">YouTube lecture URL</Label>
                <Input
                  id="facultyLectureUrl"
                  required
                  type="url"
                  value={lectureUrl}
                  onChange={(event) => setLectureUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>
              {error ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button disabled={submitting} type="submit">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Create Faculty Workspace
              </Button>
            </form>
            <p className="mt-4 text-sm text-black/55 dark:text-white/55">
              Temporary review sessions are cleared after inactivity.
            </p>
          </GlassPanel>
        </motion.div>
      </div>
    </PageShell>
  );
}
