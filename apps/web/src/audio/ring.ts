export class Ring {
  private readonly samples: Float32Array;
  private cursor = 0;

  constructor(capacity: number) {
    this.samples = new Float32Array(capacity);
  }

  get written(): number {
    return this.cursor;
  }

  get capacity(): number {
    return this.samples.length;
  }

  write(chunk: Float32Array): void {
    const { samples } = this;
    for (let i = 0; i < chunk.length; i++) samples[(this.cursor + i) % samples.length] = chunk[i]!;
    this.cursor += chunk.length;
  }

  last(count: number): Float32Array<ArrayBuffer> {
    const length = Math.min(count, this.cursor, this.samples.length);
    const out = new Float32Array(length);
    const from = this.cursor - length;
    for (let i = 0; i < length; i++) out[i] = this.samples[(from + i) % this.samples.length]!;
    return out;
  }
}
