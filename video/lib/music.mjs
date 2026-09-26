// Background music, written by code so it has no licence to worry about: a
// soft, slow four-chord loop (C – Am – F – G), a plucked arpeggio over a warm
// pad and a quiet bass note, at 92 beats a minute. It is calm on purpose —
// the design principles ask for nothing sudden — and exactly as long as the
// video, fading in and out. Returns a 44.1 kHz stereo 16-bit WAV.

export const BPM = 92;
const RATE = 44100;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// the chords, as MIDI notes (root position, around middle C)
const CHORDS = [
  [48, 60, 64, 67], // C
  [45, 57, 60, 64], // Am
  [41, 57, 60, 65], // F
  [43, 55, 59, 62], // G
];

export function music(seconds, { seed = 1, volume = 1 } = {}) {
  const n = Math.ceil(seconds * RATE);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const beat = 60 / BPM;
  const bar = beat * 4;
  let rnd = seed;
  const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  const add = (start, dur, freq, amp, attack, decay, pan, shape) => {
    const s0 = Math.floor(start * RATE);
    const len = Math.min(Math.floor(dur * RATE), n - s0);
    for (let i = 0; i < len; i++) {
      const t = i / RATE;
      const env = Math.min(1, t / attack) * Math.exp(-t / decay) * Math.min(1, (len - i) / (0.05 * RATE));
      const ph = 2 * Math.PI * freq * t;
      const v = amp * env * (shape === "pluck"
        ? Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)
        : Math.sin(ph) + 0.15 * Math.sin(2 * ph));
      L[s0 + i] += v * (1 - pan);
      R[s0 + i] += v * (1 + pan);
    }
  };

  for (let b = 0; b * bar < seconds; b++) {
    const chord = CHORDS[b % CHORDS.length];
    const t = b * bar;
    // the pad: the chord's upper notes, slow in and out
    for (const note of chord.slice(1)) add(t, bar + 0.4, midi(note), 0.035, 0.6, 3.5, 0, "pad");
    // the bass on the first beat
    add(t, bar, midi(chord[0]), 0.09, 0.02, 1.2, 0, "pad");
    // the arpeggio, eighth notes up and down the chord, an octave up
    const arp = [1, 2, 3, 2, 1, 2, 3, 2].map((k) => chord[k] + 12);
    arp.forEach((note, k) => {
      const soft = k % 2 ? 0.5 : 0.7;
      add(t + (k * beat) / 2, beat * 1.5, midi(note), 0.05 * soft * (0.9 + 0.2 * random()), 0.005, 0.45, (k % 2 ? 0.25 : -0.25), "pluck");
    });
  }

  // fade in 0.6 s, out 1.5 s; then scale to a quiet, even level
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = Math.min(1, t / 0.6, (seconds - t) / 1.5);
    L[i] *= Math.max(0, f);
    R[i] *= Math.max(0, f);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = (peak ? 0.5 / peak : 1) * volume; // volume 0: silence, for a video without music

  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
