import { z } from "zod";

export const artifactTypes = [
  "OUTLINE",
  "SUMMARY_SHORT",
  "SUMMARY_MEDIUM",
  "STUDY_GUIDE",
  "FLASHCARDS",
  "QUIZ",
  "MIND_MAP"
] as const;

export const generateArtifactTypes = [...artifactTypes, "ALL"] as const;

export const artifactTypeSchema = z.enum(artifactTypes);
export const generateArtifactTypeSchema = z.enum(generateArtifactTypes);

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type GenerateArtifactType = z.infer<typeof generateArtifactTypeSchema>;

export const languageCodes = ["en", "es", "hi", "te", "fr", "ar"] as const;
export const languageSchema = z.enum(languageCodes);
export type LanguageCode = z.infer<typeof languageSchema>;

export const languageNames: Record<LanguageCode, string> = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  te: "Telugu",
  fr: "French",
  ar: "Arabic"
};

export function normalizeArtifactLanguage(value?: string | null): LanguageCode {
  const normalized = value?.trim().toLowerCase();
  const parsed = languageSchema.safeParse(normalized);

  return parsed.success ? parsed.data : "en";
}

export const citationSchema = z
  .object({
    evidenceSegmentId: z.string().min(1),
    startSec: z.number().finite().min(0),
    endSec: z.number().finite().min(0),
    label: z.string().min(1)
  })
  .strict()
  .refine((value) => value.endSec >= value.startSec, {
    message: "Citation endSec must be greater than or equal to startSec."
  });

export type ArtifactCitation = z.infer<typeof citationSchema>;

export const citationIdSchema = z
  .string()
  .trim()
  .regex(/^C[1-9]\d*$/, "Citation must be a provided handle like C17.");

export type ArtifactCitationId = z.infer<typeof citationIdSchema>;

const citedTextItemSchema = z
  .object({
    text: z.string().trim().min(1),
    citations: z.array(citationSchema).min(1)
  })
  .strict();

const modelCitationArraySchema = z.array(citationIdSchema).min(1);

const modelCitedTextItemSchema = z
  .object({
    text: z.string().trim().min(1),
    citations: modelCitationArraySchema
  })
  .strict();

export const outlineArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(1),
            summary: z.string().trim().min(1),
            citations: z.array(citationSchema).min(1),
            children: z
              .array(
                z
                  .object({
                    heading: z.string().trim().min(1),
                    summary: z.string().trim().min(1),
                    citations: z.array(citationSchema).min(1)
                  })
                  .strict()
              )
              .default([])
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const modelOutlineArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(1),
            summary: z.string().trim().min(1),
            citations: modelCitationArraySchema,
            children: z
              .array(
                z
                  .object({
                    heading: z.string().trim().min(1),
                    summary: z.string().trim().min(1),
                    citations: modelCitationArraySchema
                  })
                  .strict()
              )
              .default([])
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const shortSummaryArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    bullets: z.array(citedTextItemSchema).min(1)
  })
  .strict();

export const modelShortSummaryArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    bullets: z.array(modelCitedTextItemSchema).min(1)
  })
  .strict();

export const mediumSummaryArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(1),
            text: z.string().trim().min(1),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const modelMediumSummaryArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(1),
            text: z.string().trim().min(1),
            citations: modelCitationArraySchema
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const studyGuideArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    overview: citedTextItemSchema,
    keyConcepts: z
      .array(
        z
          .object({
            term: z.string().trim().min(1),
            explanation: z.string().trim().min(1),
            whyItMatters: z.string().trim().min(1),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
      )
      .min(1),
    importantDetails: z.array(citedTextItemSchema).min(1),
    examples: z.array(citedTextItemSchema).default([]),
    commonMistakes: z
      .array(
        z
          .object({
            mistake: z.string().trim().min(1),
            correction: z.string().trim().min(1),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
      )
      .default([]),
    reviewPlan: z
      .array(
        z
          .object({
            step: z.string().trim().min(1),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const modelStudyGuideArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    overview: modelCitedTextItemSchema,
    keyConcepts: z
      .array(
        z
          .object({
            term: z.string().trim().min(1),
            explanation: z.string().trim().min(1),
            whyItMatters: z.string().trim().min(1),
            citations: modelCitationArraySchema
          })
          .strict()
      )
      .min(1),
    importantDetails: z.array(modelCitedTextItemSchema).min(1),
    examples: z.array(modelCitedTextItemSchema).default([]),
    commonMistakes: z
      .array(
        z
          .object({
            mistake: z.string().trim().min(1),
            correction: z.string().trim().min(1),
            citations: modelCitationArraySchema
          })
          .strict()
      )
      .default([]),
    reviewPlan: z
      .array(
        z
          .object({
            step: z.string().trim().min(1),
            citations: modelCitationArraySchema
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const flashcardsArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    cards: z
      .array(
        z
          .object({
            front: z.string().trim().min(1),
            back: z.string().trim().min(1),
            difficulty: z.enum(["easy", "medium", "hard"]),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict();

export const modelFlashcardsArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    cards: z
      .array(
        z
          .object({
            front: z.string().trim().min(1),
            back: z.string().trim().min(1),
            difficulty: z.enum(["easy", "medium", "hard"]),
            citations: modelCitationArraySchema
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict();

const quizChoiceSchema = z
  .object({
    id: z.enum(["A", "B", "C", "D"]),
    text: z.string().trim().min(1)
  })
  .strict();

export const quizArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    questions: z
      .array(
        z
          .object({
            question: z.string().trim().min(1),
            choices: z.array(quizChoiceSchema).length(4),
            correctChoiceId: z.enum(["A", "B", "C", "D"]),
            explanation: z.string().trim().min(1),
            difficulty: z.enum(["easy", "medium", "hard"]),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
          .refine(
            (question) =>
              question.choices.some(
                (choice) => choice.id === question.correctChoiceId
              ),
            "correctChoiceId must match one of the choices."
          )
      )
      .min(1)
      .max(12)
  })
  .strict();

export const modelQuizArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    questions: z
      .array(
        z
          .object({
            question: z.string().trim().min(1),
            choices: z.array(quizChoiceSchema).length(4),
            correctChoiceId: z.enum(["A", "B", "C", "D"]),
            explanation: z.string().trim().min(1),
            difficulty: z.enum(["easy", "medium", "hard"]),
            citations: modelCitationArraySchema
          })
          .strict()
          .refine(
            (question) =>
              question.choices.some(
                (choice) => choice.id === question.correctChoiceId
              ),
            "correctChoiceId must match one of the choices."
          )
      )
      .min(1)
      .max(12)
  })
  .strict();

export const mindMapArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    nodes: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            label: z.string().trim().min(1),
            type: z.enum(["main", "concept", "detail", "example"]),
            citations: z.array(citationSchema).min(1)
          })
          .strict()
      )
      .min(1)
      .max(20),
    edges: z
      .array(
        z
          .object({
            source: z.string().trim().min(1),
            target: z.string().trim().min(1),
            label: z.string().trim().min(1)
          })
          .strict()
      )
      .max(25)
  })
  .strict();

export const modelMindMapArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    language: languageSchema,
    nodes: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            label: z.string().trim().min(1),
            type: z.enum(["main", "concept", "detail", "example"]),
            citations: modelCitationArraySchema
          })
          .strict()
      )
      .min(1)
      .max(20),
    edges: z
      .array(
        z
          .object({
            source: z.string().trim().min(1),
            target: z.string().trim().min(1),
            label: z.string().trim().min(1)
          })
          .strict()
      )
      .max(25)
  })
  .strict();

export const verifierIssueSchema = z
  .object({
    path: z.string().min(1),
    problem: z.string().min(1),
    suggestedAction: z.enum(["remove", "soften", "addCitation", "regenerate"])
  })
  .strict();

export const verifierResultSchema = z
  .object({
    verdict: z.enum(["pass", "repair", "fail"]),
    issues: z.array(verifierIssueSchema).default([])
  })
  .strict();

export type VerifierResult = z.infer<typeof verifierResultSchema>;

export const artifactSchemas = {
  OUTLINE: outlineArtifactSchema,
  SUMMARY_SHORT: shortSummaryArtifactSchema,
  SUMMARY_MEDIUM: mediumSummaryArtifactSchema,
  STUDY_GUIDE: studyGuideArtifactSchema,
  FLASHCARDS: flashcardsArtifactSchema,
  QUIZ: quizArtifactSchema,
  MIND_MAP: mindMapArtifactSchema
} as const;

export const modelArtifactSchemas = {
  OUTLINE: modelOutlineArtifactSchema,
  SUMMARY_SHORT: modelShortSummaryArtifactSchema,
  SUMMARY_MEDIUM: modelMediumSummaryArtifactSchema,
  STUDY_GUIDE: modelStudyGuideArtifactSchema,
  FLASHCARDS: modelFlashcardsArtifactSchema,
  QUIZ: modelQuizArtifactSchema,
  MIND_MAP: modelMindMapArtifactSchema
} as const;

export type OutlineArtifact = z.infer<typeof outlineArtifactSchema>;
export type ShortSummaryArtifact = z.infer<typeof shortSummaryArtifactSchema>;
export type MediumSummaryArtifact = z.infer<typeof mediumSummaryArtifactSchema>;
export type StudyGuideArtifact = z.infer<typeof studyGuideArtifactSchema>;
export type FlashcardsArtifact = z.infer<typeof flashcardsArtifactSchema>;
export type QuizArtifact = z.infer<typeof quizArtifactSchema>;
export type MindMapArtifact = z.infer<typeof mindMapArtifactSchema>;

export type ModelOutlineArtifact = z.infer<typeof modelOutlineArtifactSchema>;
export type ModelShortSummaryArtifact = z.infer<
  typeof modelShortSummaryArtifactSchema
>;
export type ModelMediumSummaryArtifact = z.infer<
  typeof modelMediumSummaryArtifactSchema
>;
export type ModelStudyGuideArtifact = z.infer<
  typeof modelStudyGuideArtifactSchema
>;
export type ModelFlashcardsArtifact = z.infer<
  typeof modelFlashcardsArtifactSchema
>;
export type ModelQuizArtifact = z.infer<typeof modelQuizArtifactSchema>;
export type ModelMindMapArtifact = z.infer<typeof modelMindMapArtifactSchema>;

export type ArtifactJson =
  | OutlineArtifact
  | ShortSummaryArtifact
  | MediumSummaryArtifact
  | StudyGuideArtifact
  | FlashcardsArtifact
  | QuizArtifact
  | MindMapArtifact;

export type ModelArtifactJson =
  | ModelOutlineArtifact
  | ModelShortSummaryArtifact
  | ModelMediumSummaryArtifact
  | ModelStudyGuideArtifact
  | ModelFlashcardsArtifact
  | ModelQuizArtifact
  | ModelMindMapArtifact;

export function getArtifactSchema(artifactType: ArtifactType) {
  return artifactSchemas[artifactType];
}

export function getModelArtifactSchema(artifactType: ArtifactType) {
  return modelArtifactSchemas[artifactType];
}

export function parseArtifactJson(
  artifactType: ArtifactType,
  json: unknown
): ArtifactJson {
  return getArtifactSchema(artifactType).parse(json) as ArtifactJson;
}

export function getArtifactJsonSchemaDescription(artifactType: ArtifactType) {
  switch (artifactType) {
    case "OUTLINE":
      return `{"title":"string","language":"en","sections":[{"heading":"string","summary":"string","citations":[Citation],"children":[{"heading":"string","summary":"string","citations":[Citation]}]}]}`;
    case "SUMMARY_SHORT":
      return `{"title":"90-second summary","language":"en","bullets":[{"text":"string","citations":[Citation]}]}`;
    case "SUMMARY_MEDIUM":
      return `{"title":"5-minute summary","language":"en","sections":[{"heading":"string","text":"string","citations":[Citation]}]}`;
    case "STUDY_GUIDE":
      return `{"title":"string","language":"en","overview":{"text":"string","citations":[Citation]},"keyConcepts":[{"term":"string","explanation":"string","whyItMatters":"string","citations":[Citation]}],"importantDetails":[{"text":"string","citations":[Citation]}],"examples":[{"text":"string","citations":[Citation]}],"commonMistakes":[{"mistake":"string","correction":"string","citations":[Citation]}],"reviewPlan":[{"step":"string","citations":[Citation]}]}`;
    case "FLASHCARDS":
      return `{"title":"Flashcards","language":"en","cards":[{"front":"string","back":"string","difficulty":"easy|medium|hard","citations":[Citation]}]}`;
    case "QUIZ":
      return `{"title":"Quiz","language":"en","questions":[{"question":"string","choices":[{"id":"A","text":"string"},{"id":"B","text":"string"},{"id":"C","text":"string"},{"id":"D","text":"string"}],"correctChoiceId":"A|B|C|D","explanation":"string","difficulty":"easy|medium|hard","citations":[Citation]}]}`;
    case "MIND_MAP":
      return `{"title":"Knowledge Map","language":"en","nodes":[{"id":"string","label":"string","type":"main|concept|detail|example","citations":[Citation]}],"edges":[{"source":"node-id","target":"node-id","label":"string"}]}`;
  }
}

export function getModelArtifactJsonSchemaDescription(
  artifactType: ArtifactType
) {
  switch (artifactType) {
    case "OUTLINE":
      return `{"title":"string","language":"en","sections":[{"heading":"string","summary":"string","citations":["C1"],"children":[{"heading":"string","summary":"string","citations":["C2"]}]}]}`;
    case "SUMMARY_SHORT":
      return `{"title":"90-second summary","language":"en","bullets":[{"text":"string","citations":["C1","C2"]}]}`;
    case "SUMMARY_MEDIUM":
      return `{"title":"5-minute summary","language":"en","sections":[{"heading":"string","text":"string","citations":["C1","C2"]}]}`;
    case "STUDY_GUIDE":
      return `{"title":"string","language":"en","overview":{"text":"string","citations":["C1"]},"keyConcepts":[{"term":"string","explanation":"string","whyItMatters":"string","citations":["C2"]}],"importantDetails":[{"text":"string","citations":["C3"]}],"examples":[{"text":"string","citations":["C4"]}],"commonMistakes":[{"mistake":"string","correction":"string","citations":["C5"]}],"reviewPlan":[{"step":"string","citations":["C6"]}]}`;
    case "FLASHCARDS":
      return `{"title":"Flashcards","language":"en","cards":[{"front":"string","back":"string","difficulty":"easy|medium|hard","citations":["C1"]}]}`;
    case "QUIZ":
      return `{"title":"Quiz","language":"en","questions":[{"question":"string","choices":[{"id":"A","text":"string"},{"id":"B","text":"string"},{"id":"C","text":"string"},{"id":"D","text":"string"}],"correctChoiceId":"A|B|C|D","explanation":"string","difficulty":"easy|medium|hard","citations":["C1"]}]}`;
    case "MIND_MAP":
      return `{"title":"Knowledge Map","language":"en","nodes":[{"id":"string","label":"string","type":"main|concept|detail|example","citations":["C1"]}],"edges":[{"source":"node-id","target":"node-id","label":"string"}]}`;
  }
}
