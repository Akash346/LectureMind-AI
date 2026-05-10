export const supportedOutputLanguages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "fr", label: "French" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" }
] as const;

export const outputLanguageCodes = [
  "en",
  "es",
  "hi",
  "te",
  "fr",
  "ar",
  "zh"
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
