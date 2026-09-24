import * as React from "react";
import { Disc } from "lucide-react";
import { getCamelotRgba, normalizeCamelot } from "@/src/utils/camelot";

interface TrackArtworkProps {
  camelotKey?: string;
  size?: number; // 32, 48, 96
  className?: string;
}

export function TrackArtwork({
  camelotKey = "8A",
  size = 32,
  className = "",
}: TrackArtworkProps) {
  const norm = normalizeCamelot(camelotKey);
  const bgColor = getCamelotRgba(norm, 0.2);
  const iconColor = getCamelotRgba(norm, 0.85);

  let iconSize = 14;
  let radiusClass = "rounded-[4px]";

  if (size >= 90) {
    iconSize = 36;
    radiusClass = "rounded-[8px]";
  } else if (size >= 48) {
    iconSize = 20;
    radiusClass = "rounded-[6px]";
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: bgColor,
      }}
      className={`shrink-0 flex items-center justify-center select-none ${radiusClass} ${className}`}
      aria-hidden="true"
    >
      <Disc
        style={{ width: `${iconSize}px`, height: `${iconSize}px`, color: iconColor }}
        strokeWidth={2}
        className="shrink-0"
      />
    </div>
  );
}
