"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FacultyCitationChip } from "@/components/faculty/FacultyCitationChip";
import { useFacultyStore } from "@/lib/faculty/store";

function createMessageId() {
  return `faculty-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FacultyChatPane({
  sessionId,
  ready
}: {
  sessionId: string;
  ready: boolean;
}) {
  const messages = useFacultyStore((state) => state.messages);
  const addMessage = useFacultyStore((state) => state.addMessage);
  const updateMessage = useFacultyStore((state) => state.updateMessage);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function submit() {
    const trimmed = input.trim();
    if (!trimmed || busy || !ready) return;

    const userId = createMessageId();
    const assistantId = createMessageId();
    addMessage({ id: userId, role: "user", content: trimmed });
    addMessage({ id: assistantId, role: "assistant", content: "" });
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/faculty/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: trimmed })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Chat failed.");
      await streamText(assistantId, payload.answer, updateMessage);
      updateMessage(assistantId, {
        citations: payload.citations
      });
    } catch (error) {
      updateMessage(assistantId, {
        content: error instanceof Error ? error.message : "Chat failed."
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-[320px] flex-col rounded-lg border border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-black/55 dark:text-white/55">
            {ready ? "Ask about your lecture evidence." : "Chat unlocks when indexing is ready."}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={message.role === "user" ? "text-right" : "text-left"}
              >
                <div
                  className={[
                    "inline-block max-w-[84%] rounded-xl px-4 py-3 text-sm leading-6",
                    message.role === "user"
                      ? "bg-lm-indigo text-white"
                      : "border border-black/10 bg-lm-paper dark:border-white/10 dark:bg-lm-ink"
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.citations?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <FacultyCitationChip
                          key={`${message.id}-${citation.reference}`}
                          reference={citation.reference}
                          timestamp={citation.timestamp}
                          targetId={citation.reference}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-black/10 p-3 dark:border-white/10">
        <div className="relative">
          <Textarea
            disabled={!ready || busy}
            value={input}
            rows={2}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask how to improve this lecture"
            className="resize-none rounded-xl pr-12"
          />
          <Button
            disabled={!ready || busy || !input.trim()}
            size="icon"
            className="absolute bottom-2 right-2 h-9 w-9 rounded-lg"
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </section>
  );
}

async function streamText(
  id: string,
  text: string,
  updateMessage: (id: string, patch: { content: string }) => void
) {
  const tokens = text.match(/\S+\s*/g) ?? [text];
  let current = "";
  for (const token of tokens) {
    current += token;
    updateMessage(id, { content: current });
    await new Promise((resolve) => window.setTimeout(resolve, 18));
  }
}
