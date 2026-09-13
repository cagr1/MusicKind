/**
 * Line-buffering helper for chunked stdout/stderr streams.
 * A single logical line (e.g. "[PROGRESS:X/Y] Processing: file") can arrive
 * split across two or more `data` events, including mid-multibyte-UTF8
 * splits. LineBuffer accumulates chunks via StringDecoder (which handles
 * partial multibyte sequences correctly) and only emits complete lines.
 */
import { StringDecoder } from "string_decoder";

export class LineBuffer {
  constructor(encoding = "utf8") {
    this.decoder = new StringDecoder(encoding);
    this.pending = "";
  }

  /**
   * Feed a chunk (Buffer or string). Returns an array of complete lines
   * (newline-terminated in the source, without the trailing newline).
   * Any trailing partial line is retained internally until completed or
   * flushed.
   */
  push(chunk) {
    this.pending += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    const parts = this.pending.split("\n");
    this.pending = parts.pop();
    return parts;
  }

  /**
   * Call when the underlying stream/process closes. Returns an array with
   * the last partial line, if any non-empty content remains.
   */
  flush() {
    this.pending += this.decoder.end();
    const remaining = this.pending;
    this.pending = "";
    if (remaining.length === 0) return [];
    return [remaining];
  }
}

export default LineBuffer;
