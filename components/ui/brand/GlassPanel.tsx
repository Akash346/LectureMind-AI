import * as React from "react";

type GlassPanelProps = React.HTMLAttributes<HTMLDivElement>;

export function GlassPanel({
  className = "",
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={`rounded-lg border border-black/10 bg-black/[0.04] shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.06] dark:shadow-black/20 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
