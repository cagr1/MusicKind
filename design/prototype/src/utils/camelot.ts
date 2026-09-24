/**
 * Utilidades para notación y armonía de la rueda Camelot (1A-12B).
 * Utilizado para el cálculo de compatibilidad armónica, colores y rueda SVG.
 */

export interface CamelotInfo {
  number: number;
  letter: "A" | "B";
  key: string;
  musicalKey: string;
  rgb: [number, number, number];
  hex: string;
}

export const CAMELOT_MAP: Record<string, CamelotInfo> = {
  "1A": { number: 1, letter: "A", key: "1A", musicalKey: "Abm", rgb: [20, 184, 166], hex: "#14b8a6" },
  "1B": { number: 1, letter: "B", key: "1B", musicalKey: "B", rgb: [20, 184, 166], hex: "#14b8a6" },
  "2A": { number: 2, letter: "A", key: "2A", musicalKey: "Ebm", rgb: [6, 182, 212], hex: "#06b6d4" },
  "2B": { number: 2, letter: "B", key: "2B", musicalKey: "F#", rgb: [6, 182, 212], hex: "#06b6d4" },
  "3A": { number: 3, letter: "A", key: "3A", musicalKey: "Bbm", rgb: [34, 197, 94], hex: "#22c55e" },
  "3B": { number: 3, letter: "B", key: "3B", musicalKey: "Db", rgb: [34, 197, 94], hex: "#22c55e" },
  "4A": { number: 4, letter: "A", key: "4A", musicalKey: "Fm", rgb: [132, 204, 22], hex: "#84cc16" },
  "4B": { number: 4, letter: "B", key: "4B", musicalKey: "Ab", rgb: [132, 204, 22], hex: "#84cc16" },
  "5A": { number: 5, letter: "A", key: "5A", musicalKey: "Cm", rgb: [234, 179, 8], hex: "#eab308" },
  "5B": { number: 5, letter: "B", key: "5B", musicalKey: "Eb", rgb: [234, 179, 8], hex: "#eab308" },
  "6A": { number: 6, letter: "A", key: "6A", musicalKey: "Gm", rgb: [245, 158, 11], hex: "#f59e0b" },
  "6B": { number: 6, letter: "B", key: "6B", musicalKey: "Bb", rgb: [245, 158, 11], hex: "#f59e0b" },
  "7A": { number: 7, letter: "A", key: "7A", musicalKey: "Dm", rgb: [249, 115, 22], hex: "#f97316" },
  "7B": { number: 7, letter: "B", key: "7B", musicalKey: "F", rgb: [249, 115, 22], hex: "#f97316" },
  "8A": { number: 8, letter: "A", key: "8A", musicalKey: "Am", rgb: [239, 68, 68], hex: "#ef4444" },
  "8B": { number: 8, letter: "B", key: "8B", musicalKey: "C", rgb: [239, 68, 68], hex: "#ef4444" },
  "9A": { number: 9, letter: "A", key: "9A", musicalKey: "Em", rgb: [236, 72, 153], hex: "#ec4899" },
  "9B": { number: 9, letter: "B", key: "9B", musicalKey: "G", rgb: [236, 72, 153], hex: "#ec4899" },
  "10A": { number: 10, letter: "A", key: "10A", musicalKey: "Bm", rgb: [168, 85, 247], hex: "#a855f7" },
  "10B": { number: 10, letter: "B", key: "10B", musicalKey: "D", rgb: [168, 85, 247], hex: "#a855f7" },
  "11A": { number: 11, letter: "A", key: "11A", musicalKey: "F#m", rgb: [99, 102, 241], hex: "#6366f1" },
  "11B": { number: 11, letter: "B", key: "11B", musicalKey: "A", rgb: [99, 102, 241], hex: "#6366f1" },
  "12A": { number: 12, letter: "A", key: "12A", musicalKey: "C#m", rgb: [59, 130, 246], hex: "#3b82f6" },
  "12B": { number: 12, letter: "B", key: "12B", musicalKey: "E", rgb: [59, 130, 246], hex: "#3b82f6" },
};

/**
 * Obtiene la tonalidad normalizada (ej: '8a' -> '8A')
 */
export function normalizeCamelot(keyStr: string): string {
  if (!keyStr) return "8A";
  const cleaned = keyStr.trim().toUpperCase();
  return CAMELOT_MAP[cleaned] ? cleaned : "8A";
}

/**
 * Devuelve las tonalidades armónicamente compatibles para una tonalidad dada:
 * - Misma tonalidad (ej. 8A)
 * - Relativa (ej. 8B)
 * - Transición energética -1 (ej. 7A)
 * - Transición energética +1 (ej. 9A)
 */
export function getHarmonicMatches(keyStr: string): {
  exact: string;
  relative: string;
  minusOne: string;
  plusOne: string;
  compatibleSet: Set<string>;
} {
  const norm = normalizeCamelot(keyStr);
  const info = CAMELOT_MAP[norm] || CAMELOT_MAP["8A"];
  const num = info.number;
  const lettr = info.letter;
  const otherLetter = lettr === "A" ? "B" : "A";

  const prevNum = num === 1 ? 12 : num - 1;
  const nextNum = num === 12 ? 1 : num + 1;

  const exact = `${num}${lettr}`;
  const relative = `${num}${otherLetter}`;
  const minusOne = `${prevNum}${lettr}`;
  const plusOne = `${nextNum}${lettr}`;

  const compatibleSet = new Set<string>([exact, relative, minusOne, plusOne]);

  return { exact, relative, minusOne, plusOne, compatibleSet };
}

/**
 * Devuelve el color RGB y alpha para estilos CSS inline
 */
export function getCamelotRgba(keyStr: string, alpha: number): string {
  const norm = normalizeCamelot(keyStr);
  const info = CAMELOT_MAP[norm] || CAMELOT_MAP["8A"];
  const [r, g, b] = info.rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
