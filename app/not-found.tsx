import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="text-3xl font-semibold">This workspace is not here.</h1>
        <p className="text-sm text-muted-foreground">
          The Chat may have been deleted, or you may not have access to it.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
