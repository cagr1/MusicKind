export const SET_SEQUENCE_VERSION = 1;
export const SET_SEQUENCE_BEAM_WIDTH = 16;
export const SET_SEQUENCE_COSTS = Object.freeze({
  harmonic: Object.freeze({
    same: 0,
    adjacent: 0.5,
    relative: 1,
    clash: 4,
    unknown: 2,
  }),
  sameArtist: 1,
  downTempoMultiplier: 1.5,
  directTempoFreeDelta: 1,
  tempoRelationTolerance: 3,
});

function normalizeCamelot(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(0?[1-9]|1[0-2])\s*([AB])$/i);
  return match ? `${Number(match[1])}${match[2].toUpperCase()}` : null;
}

export function compareHarmonic(a, b) {
  const left = normalizeCamelot(a);
  const right = normalizeCamelot(b);
  if (!left || !right) return "unknown";
  if (left === right) return "same";
  const [, leftNumber, leftLetter] = left.match(/^(\d+)([AB])$/);
  const [, rightNumber, rightLetter] = right.match(/^(\d+)([AB])$/);
  if (
    leftLetter === rightLetter &&
    (Math.abs(Number(leftNumber) - Number(rightNumber)) === 1 ||
      Math.abs(Number(leftNumber) - Number(rightNumber)) === 11)
  )
    return "adjacent";
  if (leftNumber === rightNumber && leftLetter !== rightLetter)
    return "relative";
  return "clash";
}

export function compareTempo(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b))
    return { bpmDelta: null, tempoRelation: "unknown" };
  const direct = Math.abs(b - a);
  const double = Math.abs(a * 2 - b);
  const half = Math.abs(a - b * 2);
  if (
    double <= SET_SEQUENCE_COSTS.tempoRelationTolerance &&
    double < direct &&
    double <= half
  )
    return { bpmDelta: b - a * 2, tempoRelation: "double" };
  if (half <= SET_SEQUENCE_COSTS.tempoRelationTolerance && half < direct)
    return { bpmDelta: b * 2 - a, tempoRelation: "half" };
  return { bpmDelta: b - a, tempoRelation: "same" };
}

function transition(from, to) {
  if (!from || !to)
    return {
      from: from?.id ?? null,
      to: to?.id ?? null,
      bpmDelta: null,
      tempoRelation: "unknown",
      harmonic: "unknown",
      costBreakdown: { bpm: 0, harmonic: 0, artist: 0 },
      cost: 0,
    };
  const tempo = compareTempo(from.bpm, to.bpm);
  const harmonic = compareHarmonic(from.camelot, to.camelot);
  const down =
    Number.isFinite(from.bpm) && Number.isFinite(to.bpm) && to.bpm < from.bpm;
  const bpmCost =
    tempo.bpmDelta === null
      ? 0
      : Math.max(
          0,
          Math.abs(tempo.bpmDelta) - SET_SEQUENCE_COSTS.directTempoFreeDelta,
        ) * (down ? SET_SEQUENCE_COSTS.downTempoMultiplier : 1);
  const sameArtist =
    typeof from.artist === "string" &&
    typeof to.artist === "string" &&
    from.artist.trim() &&
    from.artist.trim().toLocaleLowerCase() ===
      to.artist.trim().toLocaleLowerCase();
  const costBreakdown = {
    bpm: bpmCost,
    harmonic: SET_SEQUENCE_COSTS.harmonic[harmonic],
    artist: sameArtist ? SET_SEQUENCE_COSTS.sameArtist : 0,
  };
  return {
    from: from.id,
    to: to.id,
    ...tempo,
    harmonic,
    costBreakdown,
    cost: costBreakdown.bpm + costBreakdown.harmonic + costBreakdown.artist,
  };
}

function trackId(track) {
  return String(track.id);
}

function compareTracks(a, b) {
  const bpmA = Number.isFinite(a.bpm) ? a.bpm : Infinity;
  const bpmB = Number.isFinite(b.bpm) ? b.bpm : Infinity;
  return bpmA - bpmB || trackId(a).localeCompare(trackId(b));
}

function sequenceSection(tracks, previous, firstSection) {
  const known = tracks
    .filter((track) => Number.isFinite(track.bpm))
    .slice()
    .sort(compareTracks);
  const unknown = tracks.filter((track) => !Number.isFinite(track.bpm));
  if (!known.length) {
    return {
      ordered: unknown,
      transitions: unknown.map((track, index) =>
        transition(index ? unknown[index - 1] : previous, track),
      ),
    };
  }
  const bits = known.map((_, index) => 1n << BigInt(index));
  const edgeCosts = known.map((from) =>
    known.map((to) => transition(from, to).cost),
  );
  let beam = [
    {
      node: null,
      cost: 0,
      lastIndex: previous ? -1 : -2,
      used: 0n,
      depth: 0,
      rank: 0,
    },
  ];
  while (beam[0].depth < known.length) {
    const candidates = [];
    for (const state of beam) {
      for (let index = 0; index < known.length; index++) {
        const track = known[index];
        const bit = bits[index];
        if ((state.used & bit) !== 0n) continue;
        if (firstSection && state.depth === 0) {
          const slowest = known[0];
          if (track !== slowest) continue;
        }
        const edge =
          state.lastIndex === -1
            ? transition(previous, track).cost
            : state.lastIndex >= 0
              ? edgeCosts[state.lastIndex][index]
              : 0;
        candidates.push({
          node: { parent: state.node, track },
          cost: state.cost + edge,
          lastIndex: index,
          used: state.used | bit,
          depth: state.depth + 1,
          parentRank: state.rank,
          index,
        });
      }
    }
    candidates.sort(
      (a, b) =>
        a.cost - b.cost ||
        a.parentRank - b.parentRank ||
        trackId(known[a.index]).localeCompare(trackId(known[b.index])),
    );
    beam = candidates
      .slice(0, SET_SEQUENCE_BEAM_WIDTH)
      .map((state, rank) => ({ ...state, rank }));
  }
  const knownOrder = [];
  for (let node = beam[0].node; node; node = node.parent)
    knownOrder.push(node.track);
  knownOrder.reverse();
  const ordered = [...knownOrder, ...unknown];
  return {
    ordered,
    transitions: ordered.map((track, index) =>
      transition(index ? ordered[index - 1] : previous, track),
    ),
  };
}

export function createSetSequence({ sections }) {
  if (!Array.isArray(sections)) throw new Error("sections debe ser una lista");
  const seen = new Set();
  for (const section of sections) {
    if (
      !section ||
      typeof section.key !== "string" ||
      !Array.isArray(section.tracks)
    )
      throw new Error("Sección inválida");
    for (const track of section.tracks) {
      if (
        !track ||
        (typeof track.id !== "string" && typeof track.id !== "number") ||
        seen.has(String(track.id))
      )
        throw new Error("Cada pista debe tener un id único");
      seen.add(String(track.id));
    }
  }
  let previous = null;
  const output = sections.map((section, index) => {
    const { ordered, transitions } = sequenceSection(
      section.tracks,
      previous,
      index === 0 || !previous,
    );
    if (ordered.length) previous = ordered[ordered.length - 1];
    return {
      key: section.key,
      order: ordered.map((track) => track.id),
      transitions,
    };
  });
  return { ok: true, version: SET_SEQUENCE_VERSION, sections: output };
}
