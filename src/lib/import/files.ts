// Streams files and ZIP archives (including ZIPs nested inside ZIPs, as in
// Garmin's export) entry by entry, so multi-GB exports never have to fit in
// memory. Each entry is routed by name to a text stream, a whole-bytes
// callback, or a nested archive.
import { gunzipSync, Unzip, UnzipInflate, type UnzipFile } from "fflate";

export type Progress = (fraction: number) => void;

export type EntryHandler =
  /** decoded text, chunk by chunk (for huge XML) */
  | { kind: "text"; onText: (chunk: string) => void }
  /** the whole entry at once (small files) */
  | { kind: "bytes"; onBytes: (bytes: Uint8Array, name: string) => void | Promise<void> }
  /** a ZIP inside the ZIP: its entries are routed too */
  | { kind: "zip" };

/** Decides what to do with an entry, by its path; null skips it. */
export type Router = (name: string) => EntryHandler | null;

export function isZipName(name: string) {
  return /\.zip$/i.test(name);
}

/** Gunzips `.gz` entries (Strava's activity files); other bytes pass through. */
export function maybeGunzip(name: string, bytes: Uint8Array): { name: string; bytes: Uint8Array } {
  if (/\.gz$/i.test(name) || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    try {
      return { name: name.replace(/\.gz$/i, ""), bytes: gunzipSync(bytes) };
    } catch {
      return { name, bytes };
    }
  }
  return { name, bytes };
}

function concat(chunks: Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** An Unzip instance whose entries are dispatched through the router (recursively for nested ZIPs). */
function createUnzip(route: Router, pending: Promise<void>[], fail: (e: Error) => void): Unzip {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (f: UnzipFile) => {
    if (f.name.endsWith("/")) return;
    const handler = route(f.name);
    if (!handler) return;
    if (handler.kind === "text") {
      const decoder = new TextDecoder();
      f.ondata = (err, data, final) => {
        if (err) return fail(err);
        handler.onText(decoder.decode(data, { stream: !final }));
      };
    } else if (handler.kind === "bytes") {
      const chunks: Uint8Array[] = [];
      let length = 0;
      f.ondata = (err, data, final) => {
        if (err) return fail(err);
        chunks.push(data);
        length += data.length;
        if (final) pending.push(Promise.resolve(handler.onBytes(concat(chunks, length), f.name)));
      };
    } else {
      const inner = createUnzip(route, pending, fail);
      f.ondata = (err, data, final) => {
        if (err) return fail(err);
        inner.push(data, final);
      };
    }
    f.start();
  };
  return unzip;
}

/**
 * Reads one uploaded file: a ZIP is streamed entry by entry; anything else is
 * treated as a single entry named after the file.
 */
export async function readArchive(file: File, route: Router, onProgress: Progress): Promise<void> {
  const pending: Promise<void>[] = [];
  let failure: Error | null = null;
  const reader = file.stream().getReader();
  let read = 0;

  if (isZipName(file.name) || file.type === "application/zip") {
    const unzip = createUnzip(route, pending, (e) => (failure ??= e));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      unzip.push(value);
      if (failure) throw failure;
      onProgress(read / file.size);
    }
    unzip.push(new Uint8Array(0), true);
  } else {
    const handler = route(file.name);
    if (handler?.kind === "text") {
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.length;
        handler.onText(decoder.decode(value, { stream: true }));
        onProgress(read / file.size);
      }
      handler.onText(decoder.decode());
    } else if (handler?.kind === "bytes") {
      pending.push(Promise.resolve(handler.onBytes(new Uint8Array(await file.arrayBuffer()), file.name)));
      onProgress(1);
    } else {
      await reader.cancel();
    }
  }
  if (failure) throw failure;
  await Promise.all(pending);
}
