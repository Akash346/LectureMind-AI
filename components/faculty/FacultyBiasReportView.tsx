"use client";

import { FacultyCitationChip } from "@/components/faculty/FacultyCitationChip";
import type { FacultyBiasReport } from "@/lib/faculty/prompts";

export function FacultyBiasReportView({
  report
}: {
  report?: FacultyBiasReport | null;
}) {
  if (!report) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="font-space-grotesk text-lg font-semibold">Summary</h3>
        <p className="mt-2 text-sm leading-6">{report.summary?.main_pattern}</p>
        <p className="mt-2 text-sm font-medium">
          First fix: {report.summary?.recommended_first_fix}
        </p>
      </div>
      {report.dimensions.map((dimension) => (
        <article
          key={`${dimension.dimension}-${dimension.transcript_anchor.reference}-${dimension.evidence_quote}`}
          className="rounded-lg border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium capitalize">
              {String(dimension.dimension).replace(/_/g, " ")}
            </h4>
            <span className="rounded-full bg-lm-amber/15 px-2 py-0.5 text-xs font-medium uppercase text-lm-amber">
              {dimension.severity}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6">{dimension.observation}</p>
          <blockquote className="mt-3 border-l-2 border-lm-indigo/30 pl-3 text-sm italic text-black/65 dark:text-white/65">
            {dimension.evidence_quote}
          </blockquote>
          <p className="mt-3 text-sm leading-6">
            <span className="font-medium">Suggested reframing: </span>
            {dimension.suggested_reframing}
          </p>
          <p className="mt-2 text-xs text-black/55 dark:text-white/55">
            {dimension.external_reference}
          </p>
          <div className="mt-3">
            <FacultyCitationChip
              reference={dimension.transcript_anchor?.reference}
              timestamp={dimension.transcript_anchor?.timestamp}
              targetId={dimension.transcript_anchor?.reference}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
