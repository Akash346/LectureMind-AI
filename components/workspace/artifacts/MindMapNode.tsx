"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Handle, Position } from "@xyflow/react";

import { CitationChip } from "@/components/workspace/CitationChip";

type MindMapNodeData = {
  label: string;
  summary: string;
  timestampSec: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
};

export function MindMapNode({
  id,
  data
}: {
  id: string;
  data: MindMapNodeData;
}) {
  return (
    <div className="w-[200px] rounded-2xl border border-lm-indigo/40 bg-background/95 p-3 shadow-sm">
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="font-space-grotesk text-sm font-medium leading-tight">
        {data.label}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {data.summary}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <CitationChip seconds={data.timestampSec} />
        {data.hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle(id);
            }}
            className="rounded-md p-1 transition hover:bg-lm-indigo/10"
            aria-label={data.expanded ? "Collapse node" : "Expand node"}
          >
            {data.expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
