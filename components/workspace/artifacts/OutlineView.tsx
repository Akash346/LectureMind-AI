"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { CitationChip } from "@/components/workspace/CitationChip";
import { parseTimestamp } from "@/lib/citations";
import { useCitationHandler } from "@/hooks/useCitationHandler";

type OutlineNode = {
  id?: string;
  label?: string;
  title?: string;
  text?: string;
  heading?: string;
  summary?: string;
  timestampSec?: number;
  timestamp?: string;
  seconds?: number;
  citations?: Array<{ startSec?: number; label?: string }>;
  children?: OutlineNode[];
  sections?: OutlineNode[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeNodes(data: unknown): OutlineNode[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.nodes)) return data.nodes as OutlineNode[];
  if (Array.isArray(data.outline)) return data.outline as OutlineNode[];
  if (Array.isArray(data.chapters)) return data.chapters as OutlineNode[];
  if (Array.isArray(data.sections)) return data.sections as OutlineNode[];
  return [];
}

function getLabel(node: OutlineNode) {
  return node.label ?? node.title ?? node.heading ?? node.text ?? "Untitled";
}

function getSeconds(node: OutlineNode) {
  if (typeof node.timestampSec === "number") return node.timestampSec;
  if (typeof node.seconds === "number") return node.seconds;
  if (typeof node.timestamp === "string") return parseTimestamp(node.timestamp);
  const citation = node.citations?.[0];
  if (typeof citation?.startSec === "number") return citation.startSec;
  if (typeof citation?.label === "string") return parseTimestamp(`[${citation.label}]`);
  return 0;
}

function getChildren(node: OutlineNode) {
  return node.children ?? node.sections ?? [];
}

function matchesTree(node: OutlineNode, query: string): boolean {
  const label = getLabel(node).toLowerCase();
  const summary = (node.summary ?? "").toLowerCase();
  const normalized = query.toLowerCase();
  const children = getChildren(node);

  if (!query) return true;
  if (label.includes(normalized) || summary.includes(normalized)) return true;

  return children.some((child) => matchesTree(child, query));
}

function OutlineRow({
  node,
  depth,
  query
}: {
  node: OutlineNode;
  depth: number;
  query: string;
}) {
  const handleCitation = useCitationHandler();
  const children = getChildren(node).filter((child) => matchesTree(child, query));
  const seconds = getSeconds(node);
  const label = getLabel(node);

  if (!matchesTree(node, query)) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => handleCitation(seconds)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-lm-indigo/5"
        style={{ paddingLeft: `${12 + depth * 18}px` }}
      >
        <span
          className={[
            "min-w-0 flex-1 truncate",
            depth === 0
              ? "font-space-grotesk text-lg font-semibold"
              : depth === 1
                ? "text-[15px] font-medium"
                : "text-sm"
          ].join(" ")}
        >
          {label}
        </span>
        <CitationChip seconds={seconds} />
      </button>

      {node.summary ? (
        <p
          className="px-3 pb-2 text-xs leading-5 text-muted-foreground"
          style={{ paddingLeft: `${12 + depth * 18}px` }}
        >
          {node.summary}
        </p>
      ) : null}

      {children.map((child, index) => (
        <OutlineRow
          key={child.id ?? `${label}-${index}`}
          node={child}
          depth={depth + 1}
          query={query}
        />
      ))}
    </div>
  );
}

export function OutlineView({ data }: { data: unknown }) {
  const [query, setQuery] = React.useState("");
  const nodes = normalizeNodes(data);

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background p-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search outline"
          className="h-10 rounded-xl"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {nodes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Generate an outline to see chapters and sections.
          </p>
        ) : (
          nodes.map((node, index) => (
            <OutlineRow
              key={node.id ?? `${getLabel(node)}-${index}`}
              node={node}
              depth={0}
              query={query}
            />
          ))
        )}
      </div>
    </div>
  );
}
