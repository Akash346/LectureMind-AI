import { z } from "zod";

export const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "fr", label: "French" },
  { value: "ar", label: "Arabic" }
] as const;

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
  language: z.string().default("en")
});

export const preferenceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  defaultLanguage: z.enum(["en", "es", "hi", "te", "fr", "ar"]),
  chatMode: z.enum(["default", "learning-guide", "custom"]),
  responseLength: z.enum(["short", "default", "longer"])
});
