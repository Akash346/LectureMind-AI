"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeleteNotebookDialog({
  notebookId,
  title
}: {
  notebookId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    setOpen(true);
  }

  async function confirmDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/notebooks/${notebookId}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not delete this Chat.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(
        "Could not delete this Chat. Check your connection and try again."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Delete ${title}`}
          onClick={openDialog}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove its transcript, chat history, and study materials.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p aria-live="polite" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={pending}
            onClick={(event) => event.stopPropagation()}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirmDelete}>
            {pending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
