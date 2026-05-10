"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Settings, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { savePreferences } from "@/app/actions/preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { languageOptions } from "@/lib/validators";

export type PreferenceValues = {
  theme: string;
  defaultLanguage: string;
  chatMode: string;
  responseLength: string;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Save preferences
    </Button>
  );
}

export function SettingsModal({ preference }: { preference: PreferenceValues }) {
  const [state, action] = useFormState(savePreferences, {});
  const [themeValue, setThemeValue] = useState(preference.theme);
  const { setTheme } = useTheme();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" type="button" variant="ghost">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Configure chat</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure chat</DialogTitle>
          <DialogDescription>
            Preferences are saved to your profile for future notebooks.
          </DialogDescription>
        </DialogHeader>
        <form
          action={action}
          className="space-y-4"
          onSubmit={() => setTheme(themeValue)}
        >
          <div className="space-y-2">
            <Label>Conversation mode</Label>
            <Select defaultValue={preference.chatMode} name="chatMode">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="learning-guide">Learning Guide</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Response length</Label>
            <Select defaultValue={preference.responseLength} name="responseLength">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="longer">Longer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Output language</Label>
            <Select defaultValue={preference.defaultLanguage} name="defaultLanguage">
              <SelectTrigger>
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
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              defaultValue={preference.theme}
              name="theme"
              onValueChange={setThemeValue}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.ok ? (
            <p className="text-sm text-emerald-600">Preferences saved.</p>
          ) : null}
          <SaveButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
