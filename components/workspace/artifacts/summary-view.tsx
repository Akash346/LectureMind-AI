"use client";

import type { ReactNode } from "react";
import type {
  MediumSummaryArtifact,
  ShortSummaryArtifact
} from "@/lib/ai/schemas";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CitationList } from "./citation-chip";
import type { CitationProps } from "./types";

export function SummaryView({
  shortSummary,
  mediumSummary,
  shortFallback,
  mediumFallback,
  evidenceById,
  onSeek
}: {
  shortSummary: ShortSummaryArtifact | null;
  mediumSummary: MediumSummaryArtifact | null;
  shortFallback?: ReactNode;
  mediumFallback?: ReactNode;
} & Omit<CitationProps, "citations">) {
  return (
    <Tabs defaultValue={shortSummary ? "short" : "medium"}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="short">90 sec</TabsTrigger>
        <TabsTrigger value="medium">5 min</TabsTrigger>
      </TabsList>
      <TabsContent className="mt-3" value="short">
        {shortSummary ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{shortSummary.title}</h3>
            <div className="space-y-3">
              {shortSummary.bullets.map((bullet, index) => (
                <div className="rounded-md border p-3" key={index}>
                  <p className="text-sm leading-6">{bullet.text}</p>
                  <CitationList
                    citations={bullet.citations}
                    evidenceById={evidenceById}
                    onSeek={onSeek}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          shortFallback ?? (
            <EmptySummary label="Generate the 90 second summary to fill this tab." />
          )
        )}
      </TabsContent>
      <TabsContent className="mt-3" value="medium">
        {mediumSummary ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{mediumSummary.title}</h3>
            {mediumSummary.sections.map((section, index) => (
              <div className="rounded-md border p-3" key={index}>
                <p className="text-sm font-semibold">{section.heading}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {section.text}
                </p>
                <CitationList
                  citations={section.citations}
                  evidenceById={evidenceById}
                  onSeek={onSeek}
                />
              </div>
            ))}
          </div>
        ) : (
          mediumFallback ?? (
            <EmptySummary label="Generate the 5 minute summary to fill this tab." />
          )
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptySummary({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
