import fs from "fs";

export class JsonCache {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        this.data = JSON.parse(raw);
      } catch {
        this.data = {};
      }
    }
    this.loaded = true;
  }

  get(key) {
    this.load();
    return this.data[key];
  }

  set(key, value) {
    this.load();
    this.data[key] = value;
  }

  save() {
    if (!this.loaded) return;
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }
}
