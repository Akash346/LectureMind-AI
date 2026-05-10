import type {
  ArtifactCitation,
  ArtifactJson,
  ArtifactType,
  LanguageCode
} from "@/lib/ai/schemas";

export type StudioArtifact = {
  id: string;
  notebookId: string;
  type: ArtifactType;
  language: LanguageCode;
  status: "EMPTY" | "GENERATING" | "READY" | "FAILED";
  json: ArtifactJson | null;
  errorType: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
  generatedBy: string | null;
  verifiedAt: string | null;
  sourceSegmentCount: number | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
};

export type StudioEvidence = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
};

export type CitationClickHandler = (seconds: number) => void;

export type CitationProps = {
  citations: ArtifactCitation[];
  evidenceById: Map<string, StudioEvidence>;
  onSeek: CitationClickHandler;
};
