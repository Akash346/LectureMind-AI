"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CitationChip } from "@/components/workspace/CitationChip";
import { parseTimestamp, TIMESTAMP_REGEX } from "@/lib/citations";

function renderTextWithCitations(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = new RegExp(TIMESTAMP_REGEX);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    nodes.push(
      <CitationChip
        key={`${match[0]}-${match.index}`}
        seconds={parseTimestamp(match[0])}
        label={match[0].replace("[", "").replace("]", "")}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderNodeWithCitations(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return renderTextWithCitations(node);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <React.Fragment key={index}>{renderNodeWithCitations(child)}</React.Fragment>
    ));
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return React.cloneElement(node, {
      children: renderNodeWithCitations(node.props.children)
    });
  }

  return node;
}

type CitedMarkdownProps = {
  content: string;
  className?: string;
};

export function CitedMarkdown({ content, className }: CitedMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3 leading-7 last:mb-0">
              {renderNodeWithCitations(children)}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="mb-3 mt-5 font-space-grotesk text-2xl font-semibold">
              {renderNodeWithCitations(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-5 font-space-grotesk text-xl font-semibold">
              {renderNodeWithCitations(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 font-space-grotesk text-lg font-semibold">
              {renderNodeWithCitations(children)}
            </h3>
          ),
          li: ({ children }) => (
            <li className="mb-1 leading-7">
              {renderNodeWithCitations(children)}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">
              {renderNodeWithCitations(children)}
            </strong>
          ),
          em: ({ children }) => (
            <em>{renderNodeWithCitations(children)}</em>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
