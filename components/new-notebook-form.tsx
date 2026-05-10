"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Link2, Loader2 } from "lucide-react";

import { createNotebook } from "@/app/actions/notebooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { languageOptions } from "@/lib/validators";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Link2 className="h-4 w-4" />
      )}
      Create workspace
    </Button>
  );
}

export function NewNotebookForm({ defaultLanguage }: { defaultLanguage: string }) {
  const [state, formAction] = useFormState(createNotebook, {});

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="sourceUrl">YouTube lecture URL</Label>
        <Input
          id="sourceUrl"
          name="sourceUrl"
          placeholder="https://www.youtube.com/watch?v=..."
          required
          type="url"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="language">Output language</Label>
        <Select defaultValue={defaultLanguage} name="language">
          <SelectTrigger id="language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((language) => (
              <SelectItem key={language.value} value={language.value}>
                {language.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
