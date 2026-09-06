const BATCH = 512;

// Batched so the main thread isn't woken every 128-frame render quantum.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(BATCH);
    this.filled = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;

    const frames = channels[0].length;
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (const channel of channels) sum += channel[i];
      this.batch[this.filled++] = sum / channels.length;

      if (this.filled === BATCH) {
        this.port.postMessage(this.batch);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
