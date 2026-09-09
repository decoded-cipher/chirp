import type { FingerprintReply, FingerprintRequest } from "../workers/fingerprint.worker";

export function runFingerprint(pcm: Float32Array): Promise<FingerprintReply> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/fingerprint.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<FingerprintReply>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(new Error(event.message || "fingerprinting failed"));
      worker.terminate();
    };

    // Cloned, not transferred, so the noise lab can re-run the same PCM.
    const request: FingerprintRequest = { pcm };
    worker.postMessage(request);
  });
}
