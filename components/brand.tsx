import { BrainCircuit } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({
  className,
  href = "/dashboard"
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <BrainCircuit className="h-5 w-5" />
      </span>
      <span className="text-base font-semibold tracking-normal">
        LectureMind AI
      </span>
    </Link>
  );
}
