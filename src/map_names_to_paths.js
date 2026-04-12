import fs from "fs";

const namesPath = process.argv[2];
const tracksPath = process.argv[3] || "data/tracks.csv";
const outPath = process.argv[4];

if (!namesPath || !outPath) {
  process.exit(1);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

const tracksText = fs.readFileSync(tracksPath, "utf8");
const trackLines = tracksText.split(/\r?\n/).filter(Boolean);
const trackRows = trackLines.slice(1).map(parseCsvLine);
const trackPaths = trackRows.map((r) => r[1]).filter(Boolean);

const namesText = fs.readFileSync(namesPath, "utf8");
const names = namesText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const out = [];
const unmatched = [];

for (const name of names) {
  const lower = name.toLowerCase();
  const match = trackPaths.find((p) => p.toLowerCase().includes(lower));
  if (match) {
    out.push(match);
  } else {
    unmatched.push(name);
  }
}

fs.writeFileSync(outPath, out.join("\n") + (out.length ? "\n" : ""), "utf8");
if (unmatched.length) {
  const msg = `UNMATCHED:\n${unmatched.join("\n")}\n`;
  fs.writeFileSync(outPath + ".unmatched.txt", msg, "utf8");
}
