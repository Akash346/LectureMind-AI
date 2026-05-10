"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Error({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-sm font-medium text-primary">Something went wrong</p>
        <h1 className="text-3xl font-semibold">LectureMind hit a snag.</h1>
        <p className="text-sm text-muted-foreground">
          No stack traces here. Try again, or return to your dashboard.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
