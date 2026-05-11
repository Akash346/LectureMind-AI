import Link from "next/link";

import { LMLogo, LMWordmark } from "@/components/ui/brand";
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
      <LMLogo size={36} />
      <LMWordmark className="text-base" />
    </Link>
  );
}
