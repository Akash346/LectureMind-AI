import * as React from "react";

type LMLogoProps = {
  size?: number;
  className?: string;
};

export function LMLogo({ size = 32, className }: LMLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M18 14 L18 50 L50 32 Z"
        stroke="var(--lm-indigo)"
        strokeWidth="4"
        strokeLinejoin="round"
        fill="rgba(61, 59, 217, 0.12)"
      />
      <path
        d="M18 14 L50 32 L18 50"
        stroke="var(--lm-amber)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 14 L34 24"
        stroke="var(--lm-amber)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M18 50 L34 40"
        stroke="var(--lm-amber)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="14" r="5" fill="var(--lm-indigo)" />
      <circle cx="18" cy="50" r="5" fill="var(--lm-indigo)" />
      <circle cx="50" cy="32" r="6" fill="var(--lm-amber)" />
      <circle cx="34" cy="24" r="4" fill="var(--lm-amber)" />
      <circle cx="34" cy="40" r="4" fill="var(--lm-amber)" />
    </svg>
  );
}
