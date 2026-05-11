import * as React from "react";

type LMWordmarkProps = {
  className?: string;
};

export function LMWordmark({ className }: LMWordmarkProps) {
  return (
    <span
      className={`font-space-grotesk tracking-[-0.02em] ${className ?? ""}`}
      aria-label="LectureMind"
    >
      <span className="font-normal">Lecture</span>
      <span className="font-semibold">Mind</span>
    </span>
  );
}
