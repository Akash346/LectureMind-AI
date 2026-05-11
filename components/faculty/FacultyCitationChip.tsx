"use client";

import { motion } from "framer-motion";

export function FacultyCitationChip({
  reference,
  timestamp,
  targetId
}: {
  reference: string;
  timestamp?: string;
  targetId?: string;
}) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      type="button"
      onClick={() => {
        const target = document.getElementById(targetId ?? reference);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.classList.add("ring-2", "ring-lm-amber");
        window.setTimeout(() => target?.classList.remove("ring-2", "ring-lm-amber"), 1300);
      }}
      className="inline-flex items-center gap-1 rounded-full border border-lm-indigo/20 bg-lm-indigo/10 px-2.5 py-1 text-xs font-medium text-lm-indigo transition hover:bg-lm-indigo/15 dark:border-lm-amber/30 dark:bg-lm-amber/10 dark:text-lm-amber"
    >
      {reference}
      {timestamp ? <span className="text-black/55 dark:text-white/60">{timestamp}</span> : null}
    </motion.button>
  );
}
