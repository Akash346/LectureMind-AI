"use client";

import { FacultyCitationChip } from "@/components/faculty/FacultyCitationChip";
import type { FacultyImprovementReport } from "@/lib/faculty/prompts";

export function FacultyImprovementReportView({
  report
}: {
  report?: FacultyImprovementReport | null;
}) {
  if (!report) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="font-space-grotesk text-lg font-semibold">Summary</h3>
        <p className="mt-2 text-sm leading-6">{report.summary?.overall_quality}</p>
        <p className="mt-2 text-sm font-medium">Top priority: {report.summary?.top_priority}</p>
      </div>
      {report.sections.map((section) => (
        <section key={section.section_title} className="space-y-3">
          <h3 className="font-space-grotesk text-lg font-semibold">
            {section.section_title}
          </h3>
          {section.findings.map((finding) => (
            <article
              key={`${finding.finding}-${finding.citation_reference}`}
              className="rounded-lg border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">{finding.finding}</h4>
                <span className="rounded-full bg-lm-amber/15 px-2 py-0.5 text-xs font-medium uppercase text-lm-amber">
                  {finding.severity}
                </span>
              </div>
              <blockquote className="mt-3 border-l-2 border-lm-indigo/30 pl-3 text-sm italic text-black/65 dark:text-white/65">
                {finding.evidence_quote}
              </blockquote>
              <p className="mt-3 text-sm leading-6">{finding.recommended_action}</p>
              <div className="mt-3">
                <FacultyCitationChip
                  reference={finding.transcript_anchor?.reference ?? finding.citation_reference}
                  timestamp={finding.transcript_anchor?.timestamp}
                  targetId={finding.transcript_anchor?.reference}
                />
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
