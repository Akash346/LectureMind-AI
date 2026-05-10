// TODO: YouTube ingestion should resolve video metadata and captions.
// TODO: transcript extraction should normalize segments with timestamps.
// TODO: Azure Speech fallback should run only when public transcripts are unavailable.
// TODO: Azure AI Search indexing should store transcript chunks per notebook.
// TODO: artifact generation agents should create structured study outputs.
// TODO: verifier agent should check groundedness before artifacts become READY.
// TODO: timestamp citations should link every answer back to source segments.
export const phaseTwoTodos = [
  "youtube-ingestion",
  "transcript-extraction",
  "azure-speech-fallback",
  "azure-ai-search-indexing",
  "artifact-generation-agents",
  "verifier-agent",
  "timestamp-citations"
] as const;
