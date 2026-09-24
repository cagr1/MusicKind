import * as React from "react";
import { getCamelotRgba, normalizeCamelot, CAMELOT_MAP } from "@/src/utils/camelot";

interface CamelotBadgeProps {
  camelotKey: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  interactive?: boolean;
}

export function CamelotBadge({
  camelotKey,
  className = "",
  onClick,
  interactive = false,
}: CamelotBadgeProps) {
  const norm = normalizeCamelot(camelotKey);
  const info = CAMELOT_MAP[norm] || CAMELOT_MAP["8A"];

  // Fondo al 12%, texto al 85%, sin borde, 22px de alto, mono 11px
  const bg = getCamelotRgba(norm, 0.12);
  const text = getCamelotRgba(norm, 0.85);

  const baseClasses = `h-[22px] px-2 rounded-[4px] font-mono tabular-nums text-[11px] font-semibold inline-flex items-center justify-center shrink-0 leading-none select-none transition-all duration-150 ${className}`;

  if (interactive || onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ backgroundColor: bg, color: text }}
        className={`${baseClasses} cursor-pointer hover:brightness-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F97316]`}
      >
        {norm}
      </button>
    );
  }

  return (
    <span
      style={{ backgroundColor: bg, color: text }}
      className={baseClasses}
    >
      {norm}
    </span>
  );
}
