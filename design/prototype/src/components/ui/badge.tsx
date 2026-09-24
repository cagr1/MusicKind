import * as React from "react";
import { cn } from "@/src/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "accent";
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantClasses = {
    default: "border-transparent bg-zinc-800 text-zinc-200",
    secondary: "border-zinc-800 bg-zinc-900 text-zinc-400",
    destructive: "border-transparent bg-red-950 text-red-400 border border-red-800/40",
    outline: "border-zinc-800 text-zinc-300",
    accent: "border-transparent bg-orange-950/70 text-orange-400 border border-orange-800/50",
  }[variant];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium transition-colors border tabular-nums select-none",
        variantClasses,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
