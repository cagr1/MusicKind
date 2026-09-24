export function sourceFromReason(reason = "") {
  if (reason.startsWith("override:")) return "override";
  if (reason.startsWith("discogs:")) return "discogs";
  if (reason.startsWith("id3:")) return "embedded";
  if (reason.startsWith("tag:")) return "online";
  if (reason.startsWith("local:")) return "bpm";
  if (reason.startsWith("filtered:")) return "filtered";
  return "unmatched";
}
