/** Small deterministic PRNG (mulberry32) so questions are reproducible from a seed. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickIndex(rng: Rng, length: number): number {
  return Math.floor(rng() * length);
}

/** Mixes a base seed with a counter so each generated question gets its own stream. */
export function deriveSeed(base: number, counter: number): number {
  return (Math.imul(base ^ 0x9e3779b9, 31) + Math.imul(counter + 1, 0x85ebca6b)) >>> 0;
}
