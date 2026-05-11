"use client";

import * as React from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CitedMarkdown } from "@/components/workspace/CitedMarkdown";
import { formatTimestamp } from "@/lib/citations";

function citationText(citations: unknown) {
  if (!Array.isArray(citations)) return "";

  return citations
    .map((citation) => {
      if (!citation || typeof citation !== "object") return null;
      const item = citation as { startSec?: unknown; label?: unknown };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function renderShort(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  if (Array.isArray(value.bullets)) {
    return value.bullets
      .map((bullet) => {
        const record = isRecord(bullet) ? bullet : {};
        return [record.text, citationText(record.citations)]
          .filter(Boolean)
          .join(" ");
      })
      .join("\n\n");
  }
  return asString(value.summary) || asString(value.text);
}

function renderMedium(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  if (Array.isArray(value.sections)) {
    return value.sections
      .map((section) => {
        const record = isRecord(section) ? section : {};
        return [
          `## ${asString(record.heading) || "Section"}`,
          [record.text ?? record.summary, citationText(record.citations)]
            .filter(Boolean)
            .join(" ")
        ].join("\n");
      })
      .join("\n\n");
  }
  return asString(value.summary) || asString(value.text);
}

function getValue(record: Record<string, unknown>, key: string) {
  return record[key];
}

function getSummaryText(data: unknown, key: "short" | "medium" | "full") {
  if (!isRecord(data)) return "";
  if (key === "short") {
    return renderShort(
      getValue(data, "short") ??
        getValue(data, "ninetySeconds") ??
        getValue(data, "90_seconds") ??
        getValue(data, "summary90")
    );
  }
  if (key === "medium") {
    return renderMedium(
      getValue(data, "medium") ??
        getValue(data, "fiveMinutes") ??
        getValue(data, "5_minutes") ??
        getValue(data, "summary5")
    );
  }
  return (
    renderMedium(
      getValue(data, "full") ??
        getValue(data, "long") ??
        getValue(data, "summary")
    ) ||
    renderMedium(getValue(data, "medium")) ||
    renderShort(getValue(data, "short"))
  );
}

export function SummaryView({ data }: { data: unknown }) {
  const [active, setActive] = React.useState("short");
  const text = getSummaryText(data, active as "short" | "medium" | "full");

  async function copyText() {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 p-4">
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="grid grid-cols-3 rounded-xl">
            <TabsTrigger value="short">90 seconds</TabsTrigger>
            <TabsTrigger value="medium">5 minutes</TabsTrigger>
            <TabsTrigger value="full">Full</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void copyText()}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </Button>
      </div>

      <Tabs value={active} onValueChange={setActive} className="min-h-0 flex-1">
        <TabsContent value="short" className="mt-0 h-full overflow-y-auto p-5">
          {getSummaryText(data, "short") ? (
            <CitedMarkdown content={getSummaryText(data, "short")} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Generate a summary to see cited notes.
            </p>
          )}
        </TabsContent>
        <TabsContent value="medium" className="mt-0 h-full overflow-y-auto p-5">
          <CitedMarkdown content={getSummaryText(data, "medium")} />
        </TabsContent>
        <TabsContent value="full" className="mt-0 h-full overflow-y-auto p-5">
          <CitedMarkdown content={getSummaryText(data, "full")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
