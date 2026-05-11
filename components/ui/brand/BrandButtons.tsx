"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion, type HTMLMotionProps } from "motion/react";

type BrandButtonProps = HTMLMotionProps<"button"> & {
  asChild?: boolean;
  children: React.ReactNode;
};

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

function MotionSlot({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.span
      className="inline-flex"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
    >
      <Slot className={className}>
        {children}
      </Slot>
    </motion.span>
  );
}

export function PrimaryButton({
  asChild = false,
  className = "",
  children,
  ...props
}: BrandButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-full bg-lm-indigo px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition focus:outline-none focus:ring-2 focus:ring-[rgba(245,181,68,0.6)] disabled:pointer-events-none disabled:opacity-50 ${className}`;

  if (asChild) {
    return (
      <MotionSlot className={classes} {...props}>
        {children}
      </MotionSlot>
    );
  }

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className={classes}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function SecondaryButton({
  asChild = false,
  className = "",
  children,
  ...props
}: BrandButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-full border border-black/10 bg-black/[0.04] px-5 py-3 text-sm font-semibold text-lm-ink shadow-lg shadow-black/10 backdrop-blur-xl transition focus:outline-none focus:ring-2 focus:ring-[rgba(245,181,68,0.6)] disabled:pointer-events-none disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-lm-paper dark:shadow-black/20 ${className}`;

  if (asChild) {
    return (
      <MotionSlot className={classes} {...props}>
        {children}
      </MotionSlot>
    );
  }

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className={classes}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function GhostButton({
  asChild = false,
  className = "",
  children,
  ...props
}: BrandButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-full border border-black/10 bg-transparent px-5 py-3 text-sm font-medium text-black/70 transition hover:bg-black/[0.04] hover:text-lm-ink focus:outline-none focus:ring-2 focus:ring-[rgba(245,181,68,0.6)] disabled:pointer-events-none disabled:opacity-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.06] dark:hover:text-lm-paper ${className}`;

  if (asChild) {
    return (
      <MotionSlot className={classes} {...props}>
        {children}
      </MotionSlot>
    );
  }

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className={classes}
      {...props}
    >
      {children}
    </motion.button>
  );
}
