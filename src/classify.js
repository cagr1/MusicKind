import { normalizeTag } from "./utils.js";

export function classifyFromTags(tags) {
  const normalized = tags.map(normalizeTag);
  if (hasTag(normalized, "afro house") || hasTag(normalized, "south african house") || hasTag(normalized, "amapiano") || hasTag(normalized, "organic house")) return { genre: "Afro House", reason: "tag:afro house" };
  if (hasTag(normalized, "tech house")) return { genre: "Tech House", reason: "tag:tech house" };
  if (hasTag(normalized, "deep house")) return { genre: "Deep House", reason: "tag:deep house" };
  if (hasTag(normalized, "latin house")) return { genre: "Latin House", reason: "tag:latin house" };
  if (hasTag(normalized, "minimal") && hasTag(normalized, "deep tech")) {
    return { genre: "Minimal Deep Tech", reason: "tag:minimal/deep tech" };
  }
  if (hasTag(normalized, "deep tech")) return { genre: "Minimal Deep Tech", reason: "tag:deep tech" };
  if (hasTag(normalized, "minimal")) return { genre: "Minimal Deep Tech", reason: "tag:minimal" };
  if (hasTag(normalized, "progressive house")) return { genre: "Progressive House", reason: "tag:progressive house" };
  if (hasTag(normalized, "acapella") || hasTag(normalized, "a capella") || hasTag(normalized, "acapellas")) {
    return { genre: "Acapellas Instrumental", reason: "tag:acapella" };
  }
  if (hasTag(normalized, "instrumental")) {
    return { genre: "Acapellas Instrumental", reason: "tag:instrumental" };
  }
  if (hasTag(normalized, "dance pop") || hasTag(normalized, "pop dance") || hasTag(normalized, "dance-pop")) {
    return { genre: "Dance Pop", reason: "tag:dance pop" };
  }
  if (hasTag(normalized, "nu disco") || hasTag(normalized, "nu-disco") || hasTag(normalized, "disco")) {
    return { genre: "Nu Disco", reason: "tag:nu disco/disco" };
  }
  if (hasTag(normalized, "melodic techno") || hasTag(normalized, "melodic house techno") || hasTag(normalized, "organic techno") || hasTag(normalized, "minimal techno")) {
    return { genre: "Melodic Techno", reason: "tag:melodic techno" };
  }
  if (hasTag(normalized, "melodic house") || hasTag(normalized, "melodic")) {
    return { genre: "Melodic House & Techno", reason: "tag:melodic house/techno" };
  }
  if (hasTag(normalized, "house")) return { genre: "House", reason: "tag:house" };
  return null;
}

export function classifyFromAudio({ tempo, energy }) {
  if (!tempo || energy == null) return null;

  if (tempo >= 110 && tempo <= 123 && energy >= 0.6) {
    return { genre: "Afro House", reason: `spotify:audio:tempo=${tempo.toFixed(1)} energy=${energy.toFixed(2)}` };
  }

  if (tempo >= 122 && tempo <= 128 && energy >= 0.65) {
    return { genre: "Tech House", reason: `spotify:audio:tempo=${tempo.toFixed(1)} energy=${energy.toFixed(2)}` };
  }

  if (tempo >= 118 && tempo <= 130 && energy >= 0.35 && energy < 0.65) {
    return { genre: "Melodic Techno", reason: `spotify:audio:tempo=${tempo.toFixed(1)} energy=${energy.toFixed(2)}` };
  }

  return null;
}

function hasTag(tags, phrase) {
  const target = normalizeTag(phrase);
  return tags.some((t) => t === target || t.includes(target));
}

export function classifyFromBpm(bpm) {
  if (!bpm) return null;
  if (bpm >= 108 && bpm <= 126) return { genre: "Afro House", reason: `local:bpm=${bpm.toFixed(1)}` };
  if (bpm >= 123 && bpm <= 132) return { genre: "Tech House", reason: `local:bpm=${bpm.toFixed(1)}` };
  if (bpm >= 118 && bpm <= 136) return { genre: "Melodic Techno", reason: `local:bpm=${bpm.toFixed(1)}` };
  if (bpm >= 115 && bpm <= 132) return { genre: "Melodic House & Techno", reason: `local:bpm=${bpm.toFixed(1)}` };
  return null;
}
