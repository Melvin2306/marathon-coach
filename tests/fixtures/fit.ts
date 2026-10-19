// Writes the canonical run as a FIT activity with Garmin's official encoder
// (dev dependency only), so the app's decoder is tested against the reference implementation.
import { Encoder, Profile } from "@garmin/fitsdk";
import { EXPECTED, POINTS, START_MS } from "./canonical";

const SEMICIRCLES = 2 ** 31 / 180;

// The SDK's message types are narrower than what its encoder accepts at runtime.
type Mesg = Parameters<Encoder["onMesg"]>[1];
const m = (fields: Record<string, unknown>) => fields as unknown as Mesg;

export function fitActivity({ manufacturer = "garmin", sport = "running", subSport = "generic" } = {}): Uint8Array {
  const encoder = new Encoder();
  const start = new Date(START_MS);
  const end = new Date(START_MS + EXPECTED.duration * 1000);
  encoder.onMesg(Profile.MesgNum.FILE_ID, m({ manufacturer, product: 4315, timeCreated: start, type: "activity", serialNumber: 1234 }));
  encoder.onMesg(Profile.MesgNum.EVENT, m({ timestamp: start, event: "timer", eventType: "start" }));
  for (const p of POINTS) {
    encoder.onMesg(Profile.MesgNum.RECORD, m({
      timestamp: new Date(p.ms),
      positionLat: Math.round(p.lat * SEMICIRCLES),
      positionLong: Math.round(p.lon * SEMICIRCLES),
      distance: p.dist,
      enhancedSpeed: p.speed,
      enhancedAltitude: p.alt,
      heartRate: p.hr,
      // FIT running cadence counts one foot.
      cadence: p.cad / 2,
    }));
  }
  encoder.onMesg(Profile.MesgNum.EVENT, m({ timestamp: end, event: "timer", eventType: "stopAll" }));
  const totals = {
    timestamp: end,
    startTime: start,
    totalElapsedTime: EXPECTED.duration,
    totalTimerTime: EXPECTED.duration,
    totalDistance: EXPECTED.distance,
    avgHeartRate: EXPECTED.avgHr,
    maxHeartRate: EXPECTED.maxHr,
    totalAscent: EXPECTED.elevationGain,
    totalCalories: 702,
    sport,
    subSport,
  };
  encoder.onMesg(Profile.MesgNum.LAP, m({ ...totals, messageIndex: 0 }));
  encoder.onMesg(Profile.MesgNum.SESSION, m({ ...totals, messageIndex: 0, firstLapIndex: 0, numLaps: 1 }));
  encoder.onMesg(Profile.MesgNum.ACTIVITY, m({ timestamp: end, totalTimerTime: EXPECTED.duration, numSessions: 1, type: "manual", event: "activity", eventType: "stop" }));
  return encoder.close();
}
