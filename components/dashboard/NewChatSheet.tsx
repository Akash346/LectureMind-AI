"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Link2 } from "lucide-react";

import { createNotebook } from "@/app/actions/notebooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { isValidYouTubeUrl } from "@/lib/utils/youtube";
import { languageOptions } from "@/lib/validators";

type NewChatSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewChatSheet({
  open,
  onOpenChange
}: NewChatSheetProps) {
  const [state, formAction] = useFormState(createNotebook, {});
  const [url, setUrl] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setUrl("");
      setClientError(null);
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const trimmedUrl = url.trim();

    if (!isValidYouTubeUrl(trimmedUrl)) {
      event.preventDefault();
      setClientError("Paste a valid YouTube lecture URL.");
      return;
    }

    setClientError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-black/10 bg-lm-paper text-lm-ink dark:border-white/10 dark:bg-lm-ink dark:text-lm-paper">
        <DialogHeader>
          <DialogTitle className="font-space-grotesk text-2xl">
            New Chat
          </DialogTitle>
        </DialogHeader>
        <form
          action={formAction}
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <input name="language" type="hidden" value={language} />
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="sourceUrl">
                Lecture URL
              </label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Paste a YouTube lecture URL"
                type="url"
                value={url}
              />
            </div>
            <div className="w-40 shrink-0 space-y-2">
              <label className="text-sm font-medium" htmlFor="language">
                Study language
              </label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {clientError ? (
            <p className="text-sm text-red-600 dark:text-red-300">
              {clientError}
            </p>
          ) : null}
          {state.error ? (
            <p className="text-sm text-red-600 dark:text-red-300">
              Could not create this chat. Try again.
            </p>
          ) : null}
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      <Link2 className="h-4 w-4" />
      Create chat
    </Button>
  );
}
