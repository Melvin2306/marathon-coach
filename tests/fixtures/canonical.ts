// One synthetic run, sampled every second, that every provider fixture is
// generated from. Parsing any of them must give back (nearly) the same run.

export const START_ISO = "2026-10-12T05:00:00.000Z"; // 07:00 in Berlin
export const START_MS = Date.parse(START_ISO);
export const DURATION = 3000; // s

export interface Point {
  t: number;
  ms: number;
  dist: number;
  lat: number;
  lon: number;
  alt: number;
  hr: number;
  /** steps per minute */
  cad: number;
  speed: number;
}

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

function build(): Point[] {
  seed = 42;
  const points: Point[] = [];
  let dist = 0;
  // Head north-east from Berlin's Tiergarten.
  let lat = 52.5145;
  let lon = 13.3501;
  const bearing = (35 * Math.PI) / 180;
  for (let t = 0; t <= DURATION; t++) {
    const speed = 3.33 + 0.25 * Math.sin((2 * Math.PI * t) / 600) + rnd() * 0.05;
    if (t > 0) {
      dist += speed;
      lat += (speed * Math.cos(bearing)) / 111_320;
      lon += (speed * Math.sin(bearing)) / (111_320 * Math.cos((lat * Math.PI) / 180));
    }
    const hrBase = t < 600 ? 125 + (35 * t) / 600 : 160 + (8 * (t - 600)) / (DURATION - 600);
    points.push({
      t,
      ms: START_MS + t * 1000,
      dist,
      lat,
      lon,
      alt: 40 + 15 * Math.sin((2 * Math.PI * t) / 900),
      hr: Math.round(hrBase + rnd() * 4),
      cad: 170 + Math.round(rnd() * 2) * 2,
      speed,
    });
  }
  return points;
}

export const POINTS = build();
const last = POINTS[POINTS.length - 1];

/** What every parser should report for the canonical run. */
export const EXPECTED = {
  date: "2026-10-12",
  startTime: "07:00",
  distance: last.dist,
  duration: DURATION,
  avgHr: Math.round(POINTS.reduce((s, p) => s + p.hr, 0) / POINTS.length),
  maxHr: Math.max(...POINTS.map((p) => p.hr)),
  cadence: Math.round(POINTS.reduce((s, p) => s + p.cad, 0) / POINTS.length),
  // 15 m amplitude, 900 s period: 3⅓ climbs of 30 m.
  elevationGain: 100,
  avgPace: DURATION / (last.dist / 1000),
};

export const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
