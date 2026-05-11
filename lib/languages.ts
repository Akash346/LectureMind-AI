export const supportedOutputLanguages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
] as const;

export const outputLanguageCodes = [
  "en",
  "es",
  "fr",
  "de",
  "hi",
  "te",
  "zh",
  "ar"
] as const;

export type OutputLanguageCode = (typeof outputLanguageCodes)[number];

export const outputLanguageLabels: Record<OutputLanguageCode, string> =
  Object.fromEntries(
    supportedOutputLanguages.map((language) => [language.value, language.label])
  ) as Record<OutputLanguageCode, string>;

export function normalizeOutputLanguage(
  value?: string | null
): OutputLanguageCode {
  const normalized = value?.trim().toLowerCase();

  return outputLanguageCodes.includes(normalized as OutputLanguageCode)
    ? (normalized as OutputLanguageCode)
    : "en";
}

export function getOutputLanguageLabel(value?: string | null) {
  const language = normalizeOutputLanguage(value);

  return outputLanguageLabels[language];
}
