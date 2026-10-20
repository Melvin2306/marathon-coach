// Runs importFiles() off the main thread, so the page stays responsive (e.g.
// typing into the plan form) while a large export is parsed.
import { ImportError, importFiles, type ImportResult } from "./importer";

export interface WorkerRequest {
  files: File[];
  since: string;
}

export type WorkerMessage =
  | { type: "progress"; fraction: number }
  | { type: "done"; result: ImportResult }
  | { type: "error"; reason: ImportError["reason"] };

const post = (message: WorkerMessage) => (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage(message);

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { files, since } = event.data;
  let last = -1;
  try {
    const result = await importFiles(files, {
      since,
      onProgress: (fraction) => {
        // Whole percent steps are enough for the progress bar.
        const percent = Math.floor(fraction * 100);
        if (percent !== last) post({ type: "progress", fraction: (last = percent) / 100 });
      },
    });
    post({ type: "done", result });
  } catch (e) {
    post({ type: "error", reason: e instanceof ImportError ? e.reason : "unreadable" });
  }
});
