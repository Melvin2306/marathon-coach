// Streams a file (or one entry of a ZIP) through a text callback, so multi-GB
// exports never have to fit in memory at once.
import { Unzip, UnzipInflate } from "fflate";

export type Progress = (fraction: number) => void;

export function isZip(file: File) {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
}

/**
 * Feeds decoded text chunks to `onText`. For a ZIP, only the first entry whose
 * name matches `entry` is read. Resolves to false if no entry matched.
 */
export async function streamText(file: File, onText: (chunk: string) => void, onProgress: Progress, entry?: (name: string) => boolean): Promise<boolean> {
  const decoder = new TextDecoder();
  const reader = file.stream().getReader();
  let read = 0;

  if (!isZip(file) || !entry) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      onText(decoder.decode(value, { stream: true }));
      onProgress(read / file.size);
    }
    onText(decoder.decode());
    return true;
  }

  let found = false;
  let failure = null as Error | null;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (f) => {
    if (found || !entry(f.name)) return;
    found = true;
    f.ondata = (err, data, final) => {
      if (err) {
        failure = err;
        return;
      }
      onText(decoder.decode(data, { stream: !final }));
    };
    f.start();
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.length;
    unzip.push(value);
    if (failure) throw failure;
    onProgress(read / file.size);
  }
  unzip.push(new Uint8Array(0), true);
  if (failure) throw failure;
  return found;
}

export async function readText(file: File, entry: (name: string) => boolean, onProgress: Progress): Promise<string | null> {
  let text = "";
  const found = await streamText(file, (chunk) => (text += chunk), onProgress, entry);
  return found ? text : null;
}
