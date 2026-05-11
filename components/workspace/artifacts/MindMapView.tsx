"use client";

import * as React from "react";
import dagre from "dagre";
import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MindMapNode } from "@/components/workspace/artifacts/MindMapNode";

type MindMapTreeNode = {
  id: string;
  label: string;
  timestampSec: number;
  summary: string;
  children?: MindMapTreeNode[];
};

const nodeTypes = {
  mindMapNode: MindMapNode
};

const DAGRE_OPTIONS = {
  rankdir: "TB",
  nodesep: 50,
  ranksep: 80
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeTree(data: unknown): MindMapTreeNode | null {
  if (!isRecord(data)) return null;

  const candidate = data.root ?? data.tree ?? data.mindmap;
  if (isTreeNode(candidate)) return candidate;

  if (Array.isArray(data.nodes)) {
    return graphToTree(data);
  }

  if (isTreeNode(data)) return data;
  return null;
}

function isTreeNode(value: unknown): value is MindMapTreeNode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.timestampSec === "number" &&
    typeof value.summary === "string"
  );
}

function graphToTree(data: Record<string, unknown>): MindMapTreeNode | null {
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const records = nodes.filter(isRecord);
  const root = records.find((node) => node.type === "main") ?? records[0];

  if (!root) return null;

  const byId = new Map(records.map((node) => [String(node.id), node]));
  const childIdsBySource = new Map<string, string[]>();

  for (const edge of edges) {
    if (
      !isRecord(edge) ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string"
    ) {
      continue;
    }

    childIdsBySource.set(edge.source, [
      ...(childIdsBySource.get(edge.source) ?? []),
      edge.target
    ]);
  }

  function firstCitationSeconds(node: Record<string, unknown>) {
    const citation = Array.isArray(node.citations) ? node.citations[0] : null;
    return isRecord(citation) && typeof citation.startSec === "number"
      ? citation.startSec
      : 0;
  }

  function walk(
    node: Record<string, unknown>,
    seen: Set<string>
  ): MindMapTreeNode {
    const id = String(node.id);
    const nextSeen = new Set(seen).add(id);
    const childIds = childIdsBySource.get(id) ?? [];

    return {
      id,
      label: String(node.label ?? "Mind Map"),
      timestampSec: firstCitationSeconds(node),
      summary: String(node.summary ?? node.type ?? node.label ?? ""),
      children: childIds
        .filter((id) => !nextSeen.has(id))
        .map((id) => byId.get(id))
        .filter((child): child is Record<string, unknown> => Boolean(child))
        .map((child) => walk(child, nextSeen))
    };
  }

  return walk(root, new Set());
}

function collectInitialExpanded(root: MindMapTreeNode | null) {
  const expanded = new Set<string>();
  if (!root) return expanded;

  expanded.add(root.id);
  for (const child of root.children ?? []) {
    expanded.add(child.id);
  }

  return expanded;
}

function buildVisibleGraph({
  root,
  expanded,
  onToggle
}: {
  root: MindMapTreeNode;
  expanded: Set<string>;
  onToggle: (id: string, depth: number, hasHiddenChildren: boolean) => void;
}) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function walk(node: MindMapTreeNode, depth: number, parentId?: string) {
    const children = node.children ?? [];
    const isExpanded = expanded.has(node.id);
    const visibleChildren = isExpanded ? children : [];

    nodes.push({
      id: node.id,
      type: "mindMapNode",
      position: { x: 0, y: 0 },
      data: {
        label: node.label,
        summary: node.summary,
        timestampSec: node.timestampSec,
        hasChildren: children.length > 0,
        expanded: isExpanded,
        onToggle: () => onToggle(node.id, depth, children.length > 0)
      }
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep"
      });
    }

    for (const child of visibleChildren) {
      walk(child, depth + 1, node.id);
    }
  }

  walk(root, 0);

  return layoutGraph(nodes, edges);
}

function layoutGraph(nodes: Node[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph(DAGRE_OPTIONS);

  for (const node of nodes) {
    graph.setNode(node.id, { width: 200, height: 120 });
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const position = graph.node(node.id);

    return {
      ...node,
      position: {
        x: position.x - 100,
        y: position.y - 60
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function MindMapView({ data }: { chatId: string; data: unknown }) {
  const root = React.useMemo(() => normalizeTree(data), [data]);
  const [expanded, setExpanded] = React.useState<Set<string>>(() =>
    collectInitialExpanded(root)
  );

  React.useEffect(() => {
    setExpanded(collectInitialExpanded(root));
  }, [root]);

  const graph = React.useMemo(() => {
    if (!root) return { nodes: [], edges: [] };

    return buildVisibleGraph({
      root,
      expanded,
      onToggle: (id) => {
        setExpanded((current) => {
          const next = new Set(current);

          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }

          return next;
        });
      }
    });
  }, [root, expanded]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  React.useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph.nodes, graph.edges, setNodes, setEdges]);

  if (!root) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        Generate a mind map to explore the lecture structure.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
