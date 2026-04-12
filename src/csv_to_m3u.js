import fs from "fs";

const inPath = process.argv[2];
const outPath = process.argv[3];

if (!inPath || !outPath) {
  process.exit(1);
}

const text = fs.readFileSync(inPath, "utf8");
const lines = text.split(/\r?\n/).filter(Boolean);

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

const rows = lines.slice(1).map(parseCsvLine);
const paths = rows.map((r) => r[1]).filter(Boolean);

fs.writeFileSync(outPath, paths.join("\n") + "\n", "utf8");
