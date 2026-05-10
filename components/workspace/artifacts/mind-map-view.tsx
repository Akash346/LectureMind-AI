"use client";

import type { MindMapArtifact } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

import type { CitationProps } from "./types";

export function MindMapView({
  artifact
}: {
  artifact: MindMapArtifact;
} & Omit<CitationProps, "citations">) {
  const root =
    artifact.nodes.find((node) => node.type === "main") ?? artifact.nodes[0];
  const edgesBySource = new Map<string, MindMapArtifact["edges"]>();

  artifact.edges.forEach((edge) => {
    edgesBySource.set(edge.source, [...(edgesBySource.get(edge.source) ?? []), edge]);
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{artifact.title}</h3>
      <div className="rounded-md border bg-muted/20 p-3">
        <NodeBlock
          depth={0}
          edgesBySource={edgesBySource}
          node={root}
          nodes={artifact.nodes}
          visited={new Set()}
        />
      </div>
      <div className="grid gap-2">
        {artifact.nodes
          .filter((node) => node.id !== root.id)
          .map((node) => (
            <div className="rounded-md border p-3" key={node.id}>
              <p className="text-sm font-semibold">{node.label}</p>
              <p className="mt-1 text-xs uppercase text-muted-foreground">
                {node.type}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}

function NodeBlock({
  node,
  nodes,
  edgesBySource,
  depth,
  visited
}: {
  node: MindMapArtifact["nodes"][number];
  nodes: MindMapArtifact["nodes"];
  edgesBySource: Map<string, MindMapArtifact["edges"]>;
  depth: number;
  visited: Set<string>;
}) {
  if (visited.has(node.id)) {
    return null;
  }

  visited.add(node.id);
  const edges = edgesBySource.get(node.id) ?? [];

  return (
    <div className={cn(depth > 0 && "ml-4 border-l pl-3")}>
      <div className="rounded-md bg-background p-3 shadow-sm">
        <p className="text-sm font-semibold">{node.label}</p>
      </div>
      {edges.length > 0 ? (
        <div className="mt-2 space-y-2">
          {edges.map((edge) => {
            const target = nodes.find((item) => item.id === edge.target);

            if (!target) {
              return null;
            }

            return (
              <div key={`${edge.source}-${edge.target}-${edge.label}`}>
                <p className="mb-1 text-xs text-muted-foreground">
                  {edge.label}
                </p>
                <NodeBlock
                  depth={depth + 1}
                  edgesBySource={edgesBySource}
                  node={target}
                  nodes={nodes}
                  visited={new Set(visited)}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
