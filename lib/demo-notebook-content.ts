import type { ArtifactType, Prisma } from "@prisma/client";

export const DEMO_USER_EMAIL = "demo@lecturemind.local";
export const DEMO_USER_NAME = "Demo Reviewer";
export const DEMO_NOTEBOOK_ID = "demo-reviewer-notebook";
export const DEMO_SOURCE_URL = "https://lecturemind.local/demo/reviewer-notebook";
export const DEMO_VIDEO_ID = "lecturemind-demo";
export const DEMO_NOTEBOOK_TITLE =
  "Demo Reviewer Notebook: Building Trustworthy AI Study Tools";

export type DemoTranscriptSegment = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
};

export const demoTranscriptSegments: DemoTranscriptSegment[] = [
  {
    id: "demo-seg-001",
    startSec: 0,
    endSec: 18,
    text:
      "Welcome to this short lecture on building trustworthy AI study tools. The central question is how a learning assistant can be helpful without drifting away from the source material."
  },
  {
    id: "demo-seg-002",
    startSec: 18,
    endSec: 39,
    text:
      "The first design principle is evidence grounding. Every generated summary, quiz question, and chat answer should trace back to a specific transcript moment that the learner can inspect."
  },
  {
    id: "demo-seg-003",
    startSec: 39,
    endSec: 61,
    text:
      "Grounding changes the student experience. Instead of treating the assistant as an oracle, students can compare an answer with the original explanation and decide whether the answer is faithful."
  },
  {
    id: "demo-seg-004",
    startSec: 61,
    endSec: 83,
    text:
      "The second principle is retrieval before generation. The system should first select relevant transcript segments, then ask the model to work only from that bounded context."
  },
  {
    id: "demo-seg-005",
    startSec: 83,
    endSec: 106,
    text:
      "Retrieval also makes failures easier to handle. If no segment supports a question, the assistant should say that it lacks enough lecture evidence rather than inventing an answer."
  },
  {
    id: "demo-seg-006",
    startSec: 106,
    endSec: 128,
    text:
      "The third principle is artifact diversity. A single transcript can become a concise summary, a deeper study guide, flashcards, a quiz, and a concept map for different learning tasks."
  },
  {
    id: "demo-seg-007",
    startSec: 128,
    endSec: 151,
    text:
      "A good summary compresses the lecture without removing the chain of reasoning. It should preserve the main claim, the supporting example, and the limits of the claim."
  },
  {
    id: "demo-seg-008",
    startSec: 151,
    endSec: 174,
    text:
      "A study guide goes further. It names key concepts, explains why they matter, calls out common mistakes, and gives the learner a practical review plan."
  },
  {
    id: "demo-seg-009",
    startSec: 174,
    endSec: 195,
    text:
      "Flashcards work best when they test one concept at a time. The back of the card should be short, but the citation should let the learner revisit the full explanation."
  },
  {
    id: "demo-seg-010",
    startSec: 195,
    endSec: 218,
    text:
      "Quiz questions should include plausible distractors. The explanation matters as much as the correct answer because it teaches the distinction the student needs to remember."
  },
  {
    id: "demo-seg-011",
    startSec: 218,
    endSec: 240,
    text:
      "A concept map reveals structure. It shows that evidence grounding supports retrieval, retrieval supports safer generation, and safer generation supports student trust."
  },
  {
    id: "demo-seg-012",
    startSec: 240,
    endSec: 263,
    text:
      "In production, reliability requires a demo path that does not depend on live video extraction. A preloaded transcript can still exercise the same notebook, artifact, and chat interfaces."
  },
  {
    id: "demo-seg-013",
    startSec: 263,
    endSec: 286,
    text:
      "The important implementation detail is to reuse the normal database models. The demo should be a real notebook with real evidence rows and ready artifact records."
  },
  {
    id: "demo-seg-014",
    startSec: 286,
    endSec: 310,
    text:
      "When the demo opens, the learner should see a ready workspace immediately. Chat should be enabled, artifacts should open without generation, and YouTube ingestion should remain available as an optional path."
  }
];

const c = (id: string, startSec: number, endSec: number, label: string) => ({
  evidenceSegmentId: id,
  startSec,
  endSec,
  label
});

export const demoArtifactJsonByType: Record<
  ArtifactType,
  Prisma.InputJsonValue
> = {
  OUTLINE: {
    title: "Building Trustworthy AI Study Tools",
    language: "en",
    sections: [
      {
        heading: "Evidence grounding",
        summary:
          "Generated learning material should trace back to inspectable transcript moments.",
        citations: [c("demo-seg-002", 18, 39, "0:18")],
        children: [
          {
            heading: "Student verification",
            summary:
              "Students can compare the assistant answer with the original explanation.",
            citations: [c("demo-seg-003", 39, 61, "0:39")]
          }
        ]
      },
      {
        heading: "Retrieval before generation",
        summary:
          "The system selects relevant transcript segments before asking the model to answer.",
        citations: [c("demo-seg-004", 61, 83, "1:01")],
        children: [
          {
            heading: "Safe refusal",
            summary:
              "Unsupported questions should produce a clear insufficient-evidence response.",
            citations: [c("demo-seg-005", 83, 106, "1:23")]
          }
        ]
      },
      {
        heading: "Artifact diversity",
        summary:
          "One transcript can support summaries, study guides, flashcards, quizzes, and maps.",
        citations: [c("demo-seg-006", 106, 128, "1:46")],
        children: [
          {
            heading: "Reliable demo workspace",
            summary:
              "A preloaded transcript should exercise the normal notebook and chat interfaces.",
            citations: [c("demo-seg-012", 240, 263, "4:00")]
          }
        ]
      }
    ]
  },
  SUMMARY_SHORT: {
    title: "90 second summary",
    language: "en",
    bullets: [
      {
        text:
          "Trustworthy study tools ground every generated answer and artifact in specific transcript evidence.",
        citations: [c("demo-seg-002", 18, 39, "0:18")]
      },
      {
        text:
          "Retrieval should happen before generation so the assistant works from bounded lecture context.",
        citations: [c("demo-seg-004", 61, 83, "1:01")]
      },
      {
        text:
          "A reliable production demo can use a preloaded transcript while preserving the normal notebook UI.",
        citations: [c("demo-seg-012", 240, 263, "4:00")]
      }
    ]
  },
  SUMMARY_MEDIUM: {
    title: "5 minute summary",
    language: "en",
    sections: [
      {
        heading: "Main claim",
        text:
          "The lecture argues that AI study tools are most useful when every response remains tied to evidence the learner can inspect.",
        citations: [c("demo-seg-001", 0, 18, "0:00"), c("demo-seg-002", 18, 39, "0:18")]
      },
      {
        heading: "System pattern",
        text:
          "The core pattern is retrieval before generation: select transcript evidence first, then generate from that bounded context.",
        citations: [c("demo-seg-004", 61, 83, "1:01")]
      },
      {
        heading: "Learning outputs",
        text:
          "The same transcript can support a concise summary, study guide, flashcards, quiz, and concept map because each artifact emphasizes a different study task.",
        citations: [c("demo-seg-006", 106, 128, "1:46"), c("demo-seg-008", 151, 174, "2:31")]
      },
      {
        heading: "Production reliability",
        text:
          "The demo path should avoid live extraction by preloading transcript rows and ready artifacts through existing database models.",
        citations: [c("demo-seg-012", 240, 263, "4:00"), c("demo-seg-013", 263, 286, "4:23")]
      }
    ]
  },
  STUDY_GUIDE: {
    title: "Study guide",
    language: "en",
    overview: {
      text:
        "This lecture explains how evidence grounding, retrieval, and artifact design make AI study tools reliable.",
      citations: [c("demo-seg-001", 0, 18, "0:00"), c("demo-seg-011", 218, 240, "3:38")]
    },
    keyConcepts: [
      {
        term: "Evidence grounding",
        explanation:
          "Each generated output cites transcript evidence the learner can inspect.",
        whyItMatters:
          "Grounding lets students verify the assistant instead of trusting it blindly.",
        citations: [c("demo-seg-002", 18, 39, "0:18"), c("demo-seg-003", 39, 61, "0:39")]
      },
      {
        term: "Retrieval before generation",
        explanation:
          "The system chooses relevant transcript segments before asking the model to write.",
        whyItMatters:
          "Bounded context reduces unsupported answers and makes failure modes clearer.",
        citations: [c("demo-seg-004", 61, 83, "1:01"), c("demo-seg-005", 83, 106, "1:23")]
      },
      {
        term: "Preloaded demo notebook",
        explanation:
          "A demo notebook can use static transcript rows and ready artifacts in the normal schema.",
        whyItMatters:
          "It gives reviewers a reliable path even when live YouTube extraction is blocked.",
        citations: [c("demo-seg-012", 240, 263, "4:00"), c("demo-seg-013", 263, 286, "4:23")]
      }
    ],
    importantDetails: [
      {
        text:
          "Summaries should preserve the lecture's main claim, supporting example, and limits.",
        citations: [c("demo-seg-007", 128, 151, "2:08")]
      },
      {
        text:
          "Quiz explanations teach the distinction the student needs to remember.",
        citations: [c("demo-seg-010", 195, 218, "3:15")]
      }
    ],
    examples: [
      {
        text:
          "A flashcard tests one concept and links back to the full explanation.",
        citations: [c("demo-seg-009", 174, 195, "2:54")]
      },
      {
        text:
          "A concept map shows how grounding, retrieval, safer generation, and student trust connect.",
        citations: [c("demo-seg-011", 218, 240, "3:38")]
      }
    ],
    commonMistakes: [
      {
        mistake: "Treating the assistant as an oracle",
        correction:
          "Use citations to compare generated answers with the original lecture evidence.",
        citations: [c("demo-seg-003", 39, 61, "0:39")]
      },
      {
        mistake: "Generating without retrieval",
        correction:
          "Retrieve relevant transcript context before asking the model to produce an answer.",
        citations: [c("demo-seg-004", 61, 83, "1:01")]
      }
    ],
    reviewPlan: [
      {
        step:
          "Review evidence grounding and explain why citations improve trust.",
        citations: [c("demo-seg-002", 18, 39, "0:18")]
      },
      {
        step:
          "Practice the retrieval-before-generation sequence and its safe failure behavior.",
        citations: [c("demo-seg-004", 61, 83, "1:01"), c("demo-seg-005", 83, 106, "1:23")]
      },
      {
        step:
          "Compare summary, study guide, flashcard, quiz, and concept map purposes.",
        citations: [c("demo-seg-006", 106, 128, "1:46")]
      }
    ]
  },
  FLASHCARDS: {
    title: "Flashcards",
    language: "en",
    cards: [
      {
        front: "What is evidence grounding?",
        back:
          "Evidence grounding means each generated output traces back to a specific transcript moment.",
        difficulty: "easy",
        citations: [c("demo-seg-002", 18, 39, "0:18")]
      },
      {
        front: "Why retrieve before generation?",
        back:
          "Retrieval gives the model bounded lecture context and reduces unsupported answers.",
        difficulty: "medium",
        citations: [c("demo-seg-004", 61, 83, "1:01")]
      },
      {
        front: "What should the assistant do when evidence is missing?",
        back:
          "It should say it lacks enough lecture evidence instead of inventing an answer.",
        difficulty: "easy",
        citations: [c("demo-seg-005", 83, 106, "1:23")]
      },
      {
        front: "Why preload a demo notebook?",
        back:
          "It gives reviewers a stable path that does not depend on live video extraction.",
        difficulty: "medium",
        citations: [c("demo-seg-012", 240, 263, "4:00")]
      }
    ]
  },
  QUIZ: {
    title: "Quiz",
    language: "en",
    questions: [
      {
        question: "What is the lecture's first design principle?",
        choices: [
          { id: "A", text: "Evidence grounding" },
          { id: "B", text: "Longer videos" },
          { id: "C", text: "Removing citations" },
          { id: "D", text: "Live extraction only" }
        ],
        correctChoiceId: "A",
        explanation:
          "The lecture names evidence grounding as the first principle and says artifacts should trace back to transcript moments.",
        difficulty: "easy",
        citations: [c("demo-seg-002", 18, 39, "0:18")]
      },
      {
        question: "What should happen before generation?",
        choices: [
          { id: "A", text: "The app should hide the transcript" },
          { id: "B", text: "The model should answer without context" },
          { id: "C", text: "The system should retrieve relevant transcript segments" },
          { id: "D", text: "The quiz should be skipped" }
        ],
        correctChoiceId: "C",
        explanation:
          "The lecture describes retrieval before generation as selecting relevant transcript segments first.",
        difficulty: "medium",
        citations: [c("demo-seg-004", 61, 83, "1:01")]
      },
      {
        question: "Why does the demo path use preloaded content?",
        choices: [
          { id: "A", text: "To remove the dashboard" },
          { id: "B", text: "To avoid relying on live video extraction" },
          { id: "C", text: "To disable chat" },
          { id: "D", text: "To change the deployment URL" }
        ],
        correctChoiceId: "B",
        explanation:
          "The production reliability segment says the demo should not depend on live video extraction.",
        difficulty: "easy",
        citations: [c("demo-seg-012", 240, 263, "4:00")]
      }
    ]
  },
  MIND_MAP: {
    title: "Knowledge map",
    language: "en",
    nodes: [
      {
        id: "trustworthy-study-tools",
        label: "Trustworthy study tools",
        type: "main",
        citations: [c("demo-seg-001", 0, 18, "0:00")]
      },
      {
        id: "evidence-grounding",
        label: "Evidence grounding",
        type: "concept",
        citations: [c("demo-seg-002", 18, 39, "0:18")]
      },
      {
        id: "retrieval",
        label: "Retrieval before generation",
        type: "concept",
        citations: [c("demo-seg-004", 61, 83, "1:01")]
      },
      {
        id: "safe-failure",
        label: "Safe insufficient-evidence answer",
        type: "detail",
        citations: [c("demo-seg-005", 83, 106, "1:23")]
      },
      {
        id: "artifacts",
        label: "Summary, guide, quiz, flashcards, map",
        type: "example",
        citations: [c("demo-seg-006", 106, 128, "1:46")]
      },
      {
        id: "demo-reliability",
        label: "Preloaded demo workspace",
        type: "detail",
        citations: [c("demo-seg-012", 240, 263, "4:00")]
      }
    ],
    edges: [
      {
        source: "trustworthy-study-tools",
        target: "evidence-grounding",
        label: "requires"
      },
      {
        source: "evidence-grounding",
        target: "retrieval",
        label: "implemented through"
      },
      {
        source: "retrieval",
        target: "safe-failure",
        label: "enables"
      },
      {
        source: "evidence-grounding",
        target: "artifacts",
        label: "supports"
      },
      {
        source: "trustworthy-study-tools",
        target: "demo-reliability",
        label: "needs"
      }
    ]
  }
};
