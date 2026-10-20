// Starts an import in a Web Worker, falling back to the main thread where a
// worker can't be created.
import { ImportError, importFiles, type ImportResult } from "./importer";
import type { WorkerMessage, WorkerRequest } from "./import.worker";

export function importInBackground(files: File[], { since, onProgress }: { since: string; onProgress: (fraction: number) => void }): Promise<ImportResult> {
  const onMainThread = () => importFiles(files, { since, onProgress });
  if (typeof Worker === "undefined") return onMainThread();
  let worker: Worker;
  try {
    worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return onMainThread();
  }
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") return onProgress(message.fraction);
      worker.terminate();
      if (message.type === "done") resolve(message.result);
      else reject(new ImportError(message.reason));
    };
    // The worker failed to load or crashed: do the work here instead.
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      onMainThread().then(resolve, reject);
    };
    worker.postMessage({ files, since } satisfies WorkerRequest);
  });
}
