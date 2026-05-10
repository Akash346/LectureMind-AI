import { z } from "zod";

import { languageSchema } from "@/lib/ai/schemas";
import { supportedOutputLanguages } from "@/lib/languages";

export const languageOptions = supportedOutputLanguages;

export const newNotebookSchema = z.object({
  sourceUrl: z
    .string()
    .trim()
    .url("Paste a valid public YouTube URL.")
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.hostname === "youtu.be" ||
          url.hostname.endsWith(".youtu.be") ||
          url.hostname === "youtube.com" ||
          url.hostname.endsWith(".youtube.com")
        );
      } catch {
        return false;
      }
    }, "Only public YouTube links are supported in Phase 2."),
  language: languageSchema.default("en")
});

export const preferenceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  defaultLanguage: languageSchema,
  chatMode: z.enum(["default", "learning-guide", "custom"]),
  responseLength: z.enum(["short", "default", "longer"])
});
