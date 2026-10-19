// Serializes the canonical run into each provider's export format, following
// the structure real exports use (see the comments per writer).
import { EXPECTED, POINTS, START_MS, iso } from "./canonical";

const every = <T,>(items: T[], n: number) => items.filter((_, i) => i % n === 0);

/** Garmin Connect / Strava style GPX with the Garmin TrackPointExtension (hr, cad per foot). */
export function gpx({ creator = "Garmin Connect", type = "running", prefix = "gpxtpx", step = 1 } = {}): string {
  const pts = every(POINTS, step)
    .map(
      (p) =>
        `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">\n    <ele>${p.alt.toFixed(1)}</ele>\n    <time>${iso(p.ms)}</time>\n    <extensions><${prefix}:TrackPointExtension><${prefix}:hr>${p.hr}</${prefix}:hr><${prefix}:cad>${p.cad / 2}</${prefix}:cad></${prefix}:TrackPointExtension></extensions>\n   </trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="${creator}" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:${prefix}="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>${iso(START_MS)}</time></metadata>
 <trk>
  <name>Morning Run</name>
  <type>${type}</type>
  <trkseg>
${pts}
  </trkseg>
 </trk>
</gpx>`;
}

/** Apple Health workout route: position, elevation and speed, no heart rate. */
export function appleRouteGpx(): string {
  const pts = POINTS.map(
    (p) =>
      `<trkpt lon="${p.lon.toFixed(6)}" lat="${p.lat.toFixed(6)}"><ele>${p.alt.toFixed(6)}</ele><time>${iso(p.ms)}</time><extensions><speed>${p.speed.toFixed(6)}</speed><course>35.0</course><hAcc>2.0</hAcc><vAcc>1.5</vAcc></extensions></trkpt>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Apple Health Export" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><time>${iso(START_MS)}</time></metadata>
<trk><name>Route 2026-10-12 7:00am</name><trkseg>
${pts}
</trkseg></trk>
</gpx>`;
}

/** Garmin TCX: one lap with totals, trackpoints with DistanceMeters and RunCadence in the TPX extension. */
export function tcx({ creator = "Forerunner 965" } = {}): string {
  const pts = POINTS.map(
    (p) =>
      `<Trackpoint><Time>${iso(p.ms)}</Time><Position><LatitudeDegrees>${p.lat.toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${p.lon.toFixed(7)}</LongitudeDegrees></Position><AltitudeMeters>${p.alt.toFixed(1)}</AltitudeMeters><DistanceMeters>${p.dist.toFixed(2)}</DistanceMeters><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Speed>${p.speed.toFixed(3)}</ns3:Speed><ns3:RunCadence>${p.cad / 2}</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
 <Activities>
  <Activity Sport="Running">
   <Id>${iso(START_MS)}</Id>
   <Lap StartTime="${iso(START_MS)}">
    <TotalTimeSeconds>${EXPECTED.duration}.0</TotalTimeSeconds>
    <DistanceMeters>${EXPECTED.distance.toFixed(2)}</DistanceMeters>
    <Calories>702</Calories>
    <AverageHeartRateBpm><Value>${EXPECTED.avgHr}</Value></AverageHeartRateBpm>
    <MaximumHeartRateBpm><Value>${EXPECTED.maxHr}</Value></MaximumHeartRateBpm>
    <Intensity>Active</Intensity>
    <TriggerMethod>Manual</TriggerMethod>
    <Track>
${pts}
    </Track>
   </Lap>
   <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>${creator}</Name></Creator>
  </Activity>
 </Activities>
</TrainingCenterDatabase>`;
}
