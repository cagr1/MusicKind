export function sourceFromReason(reason = "") {
  if (reason.startsWith("override:")) return "override";
  if (reason.startsWith("spotify:")) return "spotify";
  if (reason.startsWith("id3:")) return "embedded";
  if (reason.startsWith("tag:")) return "online";
  if (reason.startsWith("local:")) return "bpm";
  if (reason.startsWith("filtered:")) return "filtered";
  return "unmatched";
}
