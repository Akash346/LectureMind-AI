"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CitedMarkdown } from "@/components/workspace/CitedMarkdown";
import { LMLogo } from "@/components/ui/brand";
import { formatTimestamp } from "@/lib/citations";
import { useDemoStore, type DemoChatMessage } from "@/lib/stores/useDemoStore";

type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ChatSurfaceProps = {
  chatId: string;
  evidenceCount?: number;
  initialMessages?: ChatMessage[];
  isDemo?: boolean;
  language?: string;
  notebookStatus?: string;
};

const SUGGESTIONS = [
  "Summarize the main argument",
  "What does the lecturer say about [topic]?",
  "Find the moment they explain [concept]"
];

function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function citationsToTimestampText(citations: unknown) {
  if (!Array.isArray(citations)) return "";

  return citations
    .map((citation) => {
      if (!citation || typeof citation !== "object") return null;
      const item = citation as {
        label?: unknown;
        startSec?: unknown;
      };
      const seconds =
        typeof item.startSec === "number" ? item.startSec : undefined;
      const label =
        typeof item.label === "string"
          ? item.label
          : seconds !== undefined
            ? formatTimestamp(seconds)
            : null;

      return label ? `[${label}]` : null;
    })
    .filter(Boolean)
    .join(" ");
}

function composeAnswer(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as {
    answer?: unknown;
    content?: unknown;
    message?: unknown;
    citations?: unknown;
  };
  const answer =
    typeof data.answer === "string"
      ? data.answer
      : typeof data.content === "string"
        ? data.content
        : typeof data.message === "string"
          ? data.message
          : "";
  const citationText = citationsToTimestampText(data.citations);

  return [answer, citationText].filter(Boolean).join("\n\n");
}

function getChatErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Chat failed safely. Try again in a moment.";
  }

  const error = (payload as { error?: unknown }).error;

  if (!error || typeof error !== "object") {
    return "Chat failed safely. Try again in a moment.";
  }

  const message = (error as { message?: unknown }).message;

  return typeof message === "string" && message.trim()
    ? message
    : "Chat failed safely. Try again in a moment.";
}

function createDemoAnswer(message: string) {
  if (message.toLowerCase().includes("moment")) {
    return "The clearest moment is when the lecturer connects the concept to a concrete example [1:18].";
  }

  return "The main argument is that context helps each new idea connect back to earlier evidence [0:42]. The lecturer then shows how that context changes the final interpretation [1:18].";
}

export function ChatSurface({
  chatId,
  evidenceCount = 0,
  initialMessages = [],
  isDemo = false,
  language = "en",
  notebookStatus = "PENDING"
}: ChatSurfaceProps) {
  const demoMessages = useDemoStore(
    (state) => state.messagesByChatId[chatId]
  );
  const setDemoMessages = useDemoStore((state) => state.setDemoMessages);
  const [messages, setMessages] = React.useState<ChatMessage[]>(
    isDemo && demoMessages ? demoMessages : initialMessages
  );
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const ready = isDemo || (notebookStatus === "READY" && evidenceCount > 0);

  React.useEffect(() => {
    if (isDemo && demoMessages) {
      setMessages(demoMessages);
    }
  }, [demoMessages, isDemo]);

  React.useEffect(() => {
    if (isDemo) {
      setDemoMessages(chatId, messages as DemoChatMessage[]);
    }
  }, [chatId, isDemo, messages, setDemoMessages]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 144);
    textarea.style.height = `${nextHeight}px`;
  }, [input]);

  async function streamIntoMessage(messageId: string, text: string) {
    const tokens = text.match(/\S+\s*/g) ?? [text];
    let frameText = "";

    for (const token of tokens) {
      frameText += token;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, content: frameText } : message
        )
      );
      await sleep(22);
    }
  }

  async function submitMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !ready) return;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: trimmed
    };

    const assistantMessage: ChatMessage = {
      id: createMessageId(),
      role: "assistant",
      content: ""
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    try {
      if (isDemo) {
        await streamIntoMessage(assistantMessage.id, createDemoAnswer(trimmed));
        return;
      }

      const response = await fetch(`/api/notebooks/${chatId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          message: trimmed,
          language,
          mode: "study",
          responseLength: "medium"
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getChatErrorMessage(payload));
      }

      const answer = composeAnswer(payload);
      await streamIntoMessage(assistantMessage.id, answer);
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content:
                  error instanceof Error
                    ? error.message
                    : "Chat failed safely. Try again in a moment."
              }
            : message
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-lm-indigo/20 bg-lm-indigo/5">
              <LMLogo className="h-7 w-7" />
            </div>
            {!ready ? (
              <p className="mb-5 max-w-md text-sm leading-6 text-muted-foreground">
                Chat will unlock when transcript evidence is ready.
              </p>
            ) : null}
            <div className="grid w-full max-w-2xl gap-3 md:grid-cols-3">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  disabled={!ready}
                  className="rounded-2xl border border-border/70 bg-card/80 p-4 text-left text-sm shadow-sm transition hover:border-lm-indigo/40 hover:shadow-md"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                const isLastStreaming =
                  isStreaming &&
                  index === messages.length - 1 &&
                  message.role === "assistant";

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={[
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    ].join(" ")}
                  >
                    {message.role === "assistant" ? (
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-lm-indigo/20 bg-lm-indigo/5">
                        <LMLogo className="h-5 w-5" />
                      </div>
                    ) : null}

                    <div
                      className={[
                        "rounded-xl px-4 py-3 text-sm shadow-sm",
                        message.role === "user"
                          ? "max-w-[70%] bg-lm-indigo text-lm-paper"
                          : "max-w-[80%] border border-border/70 bg-background/60 text-lm-ink dark:text-lm-paper"
                      ].join(" ")}
                    >
                      {message.role === "assistant" ? (
                        <div>
                          <CitedMarkdown content={message.content} />
                          {isLastStreaming ? (
                            <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-lm-indigo align-middle" />
                          ) : null}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-6">
                          {message.content}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-background/95 px-5 py-3">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            placeholder="Ask about this lecture"
            disabled={isStreaming || !ready}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
            className="max-h-36 min-h-14 resize-none rounded-2xl pr-14"
          />
          <Button
            type="button"
            size="icon"
            disabled={isStreaming || input.trim().length === 0 || !ready}
            onClick={() => void submitMessage()}
            className="absolute bottom-2 right-2 h-10 w-10 rounded-xl bg-lm-indigo text-lm-paper hover:bg-lm-indigo-deep"
            aria-label="Send"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          LectureMind only uses the lecture as source. Off topic questions get a
          polite redirect.
        </p>
      </div>
    </section>
  );
}
