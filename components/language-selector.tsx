"use client";

import { useRef } from "react";

import { saveDefaultLanguage } from "@/app/actions/preferences";
import { languageOptions } from "@/lib/validators";

export function LanguageSelector({ value }: { value: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={saveDefaultLanguage} ref={formRef}>
      <label className="sr-only" htmlFor="top-language">
        Output language
      </label>
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        defaultValue={value}
        id="top-language"
        name="defaultLanguage"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {languageOptions.map((language) => (
          <option key={language.value} value={language.value}>
            {language.label}
          </option>
        ))}
      </select>
    </form>
  );
}
