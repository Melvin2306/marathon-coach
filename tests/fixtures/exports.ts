// Whole account exports built around the canonical run, laid out like the
// real archives (folder names, file names, headers, units and time formats as
// documented per provider).
import { Encoder, Profile } from "@garmin/fitsdk";
import { gzipSync, strToU8, zipSync, type Zippable } from "fflate";
import { DURATION, EXPECTED, POINTS, START_MS } from "./canonical";
import { fitActivity } from "./fit";
import { appleRouteGpx, gpx } from "./writers";

export const file = (name: string, content: string | Uint8Array) => new File([typeof content === "string" ? content : new Uint8Array(content)], name);
export const zip = (name: string, entries: Zippable) => file(name, zipSync(entries));

const pad = (n: number) => String(n).padStart(2, "0");
/** Wall-clock "YYYY-MM-DD HH:MM:SS" at a UTC offset in minutes. */
function wall(ms: number, offset: number, sep = " ") {
  const d = new Date(ms + offset * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}${sep}${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
const BERLIN = 120; // CEST on the canonical date
const km = EXPECTED.distance / 1000;

// ---------------------------------------------------------------- Apple Health

/** export.xml with a running workout (iOS 17 layout: totals plus a nested WorkoutActivity), 5-second heart rate and daily records. */
export function appleExportXml({ hrEvery = 5 } = {}) {
  const at = (ms: number) => `${wall(ms, BERLIN)} +0200`;
  const hr = POINTS.filter((p) => p.t % hrEvery === 0)
    .map((p) => `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Runner’s Apple Watch" unit="count/min" startDate="${at(p.ms)}" endDate="${at(p.ms)}" value="${p.hr}"/>`)
    .join("\n ");
  // An iPhone also wrote heart rate during the run; only the watch's samples should count.
  const phone = `<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="iPhone" unit="count/min" startDate="${at(START_MS + 60_000)}" endDate="${at(START_MS + 60_000)}" value="60"/>`;
  const end = START_MS + DURATION * 1000;
  const stats = `
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="${at(START_MS)}" endDate="${at(end)}" sum="${km}" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="${at(START_MS)}" endDate="${at(end)}" average="${EXPECTED.avgHr}" minimum="120" maximum="${EXPECTED.maxHr}" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${at(START_MS)}" endDate="${at(end)}" sum="702" unit="Cal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" startDate="${at(START_MS)}" endDate="${at(end)}" sum="${EXPECTED.cadence * (DURATION / 60)}" unit="count"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierRunningPower" startDate="${at(START_MS)}" endDate="${at(end)}" average="245" unit="W"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [<!ELEMENT HealthData (ExportDate,Me,(Record|Workout)*)>]>
<HealthData locale="de_DE">
 <ExportDate value="2026-10-19 08:00:00 +0200"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-01"/>
 ${hr}
 ${phone}
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-12 00:01:00 +0200" endDate="2026-10-12 23:59:00 +0200" value="48"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Watch" unit="ms" startDate="2026-10-12 03:00:00 +0200" endDate="2026-10-12 03:01:00 +0200" value="62"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Watch" unit="mL/min·kg" startDate="2026-10-12 08:00:00 +0200" endDate="2026-10-12 08:00:00 +0200" value="51.3"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="${DURATION / 60}" durationUnit="min" sourceName="Runner’s Apple Watch" sourceVersion="11.0" device="&lt;&lt;HKDevice&gt;&gt;" creationDate="${at(end)}" startDate="${at(START_MS)}" endDate="${at(end)}">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <MetadataEntry key="HKElevationAscended" value="10000 cm"/>
  <MetadataEntry key="HKWeatherTemperature" value="53.6 degF"/>
  <MetadataEntry key="HKWeatherHumidity" value="6500 %"/>
  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="${at(START_MS)}" duration="5.5" durationUnit="min"/>
  <WorkoutActivity uuid="A" startDate="${at(START_MS)}" endDate="${at(end)}" duration="${DURATION / 60}" durationUnit="min">${stats}
  </WorkoutActivity>${stats}
  <WorkoutRoute sourceName="Runner’s Apple Watch" startDate="${at(START_MS)}" endDate="${at(end)}">
   <FileReference path="/workout-routes/route_2026-10-12_7.00am.gpx"/>
  </WorkoutRoute>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" totalDistance="25" totalDistanceUnit="km" startDate="2026-10-13 07:00:00 +0200" endDate="2026-10-13 08:00:00 +0200"/>
</HealthData>`;
}

export function appleExportZip({ xmlName = "export.xml" } = {}) {
  return zip("export.zip", {
    apple_health_export: {
      [xmlName]: strToU8(appleExportXml()),
      "export_cda.xml": strToU8("<ClinicalDocument/>"),
      "workout-routes": { "route_2026-10-12_7.00am.gpx": strToU8(appleRouteGpx()) },
    },
  });
}

// ---------------------------------------------------------------- Strava

const STRAVA_HEADER =
  "Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Elevation Low,Elevation High,Max Grade,Average Grade,Average Positive Grade,Average Negative Grade,Max Cadence,Average Cadence,Max Heart Rate,Average Heart Rate,Max Watts,Average Watts,Calories,Max Temperature,Average Temperature,Relative Effort,Total Work,Number of Runs,Uphill Time,Downhill Time,Other Time,Perceived Exertion";

interface StravaRowInput {
  id: number;
  date: string;
  name: string;
  type: string;
  file?: string;
  meters: number;
  seconds: number;
  avgHr?: number;
  maxHr?: number;
  rpe?: number;
  cadence?: number;
}

function stravaRow(r: StravaRowInput) {
  const cells = Array<string>(44).fill("");
  cells[0] = String(r.id);
  cells[1] = `"${r.date}"`;
  cells[2] = `"${r.name}"`;
  cells[3] = r.type;
  cells[5] = String(r.seconds);
  cells[6] = (r.meters / 1000).toFixed(2);
  cells[7] = String(r.maxHr ?? "");
  cells[9] = "false";
  cells[12] = r.file ?? "";
  cells[15] = String(r.seconds);
  cells[16] = String(r.seconds);
  cells[17] = r.meters.toFixed(1);
  cells[20] = "100.0";
  cells[29] = String(r.cadence ?? "");
  cells[30] = String(r.maxHr ?? "");
  cells[31] = String(r.avgHr ?? "");
  cells[34] = "702";
  cells[43] = String(r.rpe ?? "");
  return cells.join(",");
}

/** activities.csv (dates in UTC) and the original recordings, gzipped as Strava stores them. */
export function stravaCsv({ recording = "fit" as "fit" | "gpx" | "none", date = "Oct 12, 2026, 5:00:00 AM" } = {}) {
  const filename = recording === "fit" ? "activities/111.fit.gz" : recording === "gpx" ? "activities/111.gpx.gz" : "";
  return [
    STRAVA_HEADER,
    stravaRow({ id: 1001, date, name: "Sunday long run, felt strong", type: "Run", file: filename, meters: EXPECTED.distance, seconds: DURATION, avgHr: EXPECTED.avgHr, maxHr: EXPECTED.maxHr, rpe: 6, cadence: EXPECTED.cadence / 2 }),
    stravaRow({ id: 1002, date: "Oct 13, 2026, 4:30:00 PM", name: "Commute", type: "Ride", file: "activities/112.fit.gz", meters: 8000, seconds: 1500 }),
    // A run without a recording (logged by hand on Strava): CSV values only.
    stravaRow({ id: 1003, date: "Oct 14, 2026, 10:30:00 PM", name: "Treadmill", type: "Run", meters: 8000, seconds: 2700, avgHr: 150, maxHr: 165 }),
  ].join("\n");
}

export function stravaArchive({ recording = "fit" as "fit" | "gpx" | "none", date = "Oct 12, 2026, 5:00:00 AM" } = {}) {
  const csv = stravaCsv({ recording, date });
  const activities: Zippable = {};
  if (recording === "fit") activities["111.fit.gz"] = gzipSync(fitActivity());
  if (recording === "gpx") activities["111.gpx.gz"] = gzipSync(strToU8(gpx({ creator: "StravaGPX", type: "9", prefix: "ns3" })));
  return zip("export_12345.zip", { "activities.csv": strToU8(csv), activities, "profile.csv": strToU8("Athlete ID\n1") });
}

// ---------------------------------------------------------------- Garmin

function garminMonitoringFit() {
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "monitoringB", manufacturer: "garmin", product: 1, timeCreated: new Date(START_MS) } as unknown as Parameters<Encoder["onMesg"]>[1]);
  return encoder.close();
}

/** "Export Your Data" from Garmin Connect: summaries, wellness JSON and the original FIT files in nested ZIPs. */
export function garminExport() {
  const summaries = [
    {
      summarizedActivitiesExport: [
        {
          activityId: 9001,
          name: "Berlin Running",
          activityType: "running",
          sportType: "RUNNING",
          startTimeGmt: START_MS,
          startTimeLocal: START_MS + BERLIN * 60_000,
          duration: DURATION * 1000,
          distance: EXPECTED.distance * 100,
          elevationGain: EXPECTED.elevationGain * 100,
          avgHr: EXPECTED.avgHr,
          maxHr: EXPECTED.maxHr,
        },
        // A treadmill run whose FIT file isn't in the export.
        { activityId: 9002, name: "Treadmill", activityType: "treadmill_running", startTimeGmt: START_MS + 86_400_000, startTimeLocal: START_MS + 86_400_000 + BERLIN * 60_000, duration: 1_800_000, distance: 500_000, avgHr: 140, maxHr: 150 },
        { activityId: 9003, name: "Ride", activityType: "road_biking", startTimeGmt: START_MS + 2 * 86_400_000, duration: 3_600_000, distance: 3_000_000 },
      ],
    },
  ];
  const uploads = zipSync({ "runner@example.com_1001.fit": fitActivity(), "runner@example.com_1002.fit": garminMonitoringFit() });
  return zip("4f2c-export.zip", {
    DI_CONNECT: {
      "DI-Connect-Fitness": { "runner@example.com_0_summarizedActivities.json": strToU8(JSON.stringify(summaries)) },
      "DI-Connect-Uploaded-Files": { "UploadedFiles_0-_Part1.zip": uploads },
      "DI-Connect-Aggregator": {
        "UDSFile_2026-09-01_2026-12-10.json": strToU8(JSON.stringify([{ calendarDate: "2026-10-12", restingHeartRate: 50, currentDayRestingHeartRate: 47 }])),
      },
      "DI-Connect-Wellness": {
        "runner@example.com_healthStatusData.json": strToU8(JSON.stringify([{ calendarDate: "2026-10-12", metrics: [{ type: "HRV", value: 58 }, { type: "HR", value: 47 }] }])),
      },
      "DI-Connect-Metrics": {
        "MetricsMaxMetData_20260901_20261210.json": strToU8(JSON.stringify([{ calendarDate: "2026-10-12", vo2MaxValue: 52, sport: "RUNNING" }])),
      },
    },
  });
}

// ---------------------------------------------------------------- Polar

/** training-session JSON, newer layout: fixed-interval sample arrays, numeric sport id. */
export function polarSessionB() {
  const local = wall(START_MS, BERLIN, "T");
  return JSON.stringify({
    identifier: { id: "abc" },
    startTime: local,
    stopTime: wall(START_MS + DURATION * 1000, BERLIN, "T"),
    name: "Running",
    durationMillis: DURATION * 1000,
    distanceMeters: EXPECTED.distance,
    timezoneOffsetMinutes: BERLIN,
    sport: { id: "1" },
    product: { modelName: "Polar Vantage V3" },
    exercises: [
      {
        startTime: local,
        durationMillis: DURATION * 1000,
        distanceMeters: EXPECTED.distance,
        sport: { id: "1" },
        statistics: { statistics: [{ type: "STATISTICS_TYPE_HEART_RATE", min: 120, avg: EXPECTED.avgHr, max: EXPECTED.maxHr }] },
        samples: {
          samples: [
            { type: "HEART_RATE", intervalMillis: 1000, values: POINTS.map((p) => p.hr) },
            { type: "DISTANCE", intervalMillis: 1000, values: POINTS.map((p) => p.dist) },
            { type: "CADENCE", intervalMillis: 1000, values: POINTS.map((p) => p.cad) },
          ],
        },
        routes: { route: { startTime: local, wayPoints: POINTS.map((p) => ({ latitude: p.lat, longitude: p.lon, altitude: p.alt, elapsedMillis: p.t * 1000 })) } },
      },
    ],
    // Polar writes bare NaN for a missing reading, which isn't valid JSON.
  }).replace(/"values":\[\d+,/, '"values":[NaN,');
}

/** training-session JSON, older layout (exportVersion 2.x): timestamped samples in local time. */
export function polarSessionA() {
  const t = (ms: number) => wall(ms, BERLIN, "T") + ".000";
  return JSON.stringify({
    exportVersion: "2.6",
    startTime: t(START_MS),
    stopTime: t(START_MS + DURATION * 1000),
    timeZoneOffset: BERLIN,
    duration: `PT${DURATION}S`,
    distance: EXPECTED.distance,
    maximumHeartRate: EXPECTED.maxHr,
    averageHeartRate: EXPECTED.avgHr,
    kiloCalories: 702,
    exercises: [
      {
        startTime: t(START_MS),
        duration: `PT${DURATION}S`,
        sport: "RUNNING",
        heartRate: { min: 120, avg: EXPECTED.avgHr, max: EXPECTED.maxHr },
        samples: {
          heartRate: POINTS.map((p) => ({ dateTime: t(p.ms), value: p.hr })),
          distance: POINTS.map((p) => ({ dateTime: t(p.ms), value: p.dist })),
          altitude: POINTS.map((p) => ({ dateTime: t(p.ms), value: p.alt })),
          cadence: POINTS.map((p) => ({ dateTime: t(p.ms), value: p.cad })),
        },
      },
    ],
  });
}

export function polarExport() {
  return zip("polar-user-data-export_abc.zip", {
    "training-session-2026-10-12-8380114520-0e16eab9.json": strToU8(polarSessionB()),
    "account-data-abc.json": strToU8("{}"),
  });
}

// ---------------------------------------------------------------- Oura

const OURA_SLEEP_HEADER =
  "id;average_breath;average_heart_rate;average_hrv;awake_time;bedtime_end;bedtime_start;day;deep_sleep_duration;efficiency;heart_rate;hrv;latency;light_sleep_duration;low_battery_alert;lowest_heart_rate;movement_30_sec;period;readiness;readiness_score_delta;rem_sleep_duration;restless_periods;sleep_algorithm_version;sleep_analysis_reason;sleep_phase_30_sec;sleep_phase_5_min;sleep_score_delta;time_in_bed;total_sleep_duration;type";

/** Oura's export: semicolon CSVs, JSON in quoted cells, and a short row missing its leading cells. */
export function ouraExport({ hrEvery = 5 } = {}) {
  const json = `"{""interval"": 300.0, ""items"": [null, 74.0, 72.0]}"`;
  const sleep = [
    OURA_SLEEP_HEADER,
    `s1;17.75;52.5;61;1555;2026-10-12T06:50:23.000+02:00;2026-10-11T23:27:28.000+02:00;2026-10-12;6330;93;${json};${json};600;14000;false;46;"111";0;"{}";;5000;250;v2;"{}";"";"";;28000;25000;long_sleep`,
    // A nap: ignored.
    `s2;17.0;60.0;40;0;2026-10-12T15:30:00.000+02:00;2026-10-12T15:00:00.000+02:00;2026-10-12;0;90;${json};${json};60;1500;false;55;"1";0;"{}";;0;3;v2;"{}";"";"";;1800;1500;late_nap`,
    // Short row with the leading cells missing.
    `52.0;55;1200;2026-10-13T07:00:00.000+02:00;2026-10-12T23:00:00.000+02:00;2026-10-13;6000;92;${json};${json};600;14000;false;48;"111";0;"{}";;5000;250;v2;"{}";"";"";;28000;25000;long_sleep`,
  ].join("\n");
  const end = START_MS + DURATION * 1000;
  const iso = (ms: number) => `${wall(ms, BERLIN, "T")}.000+02:00`;
  const workout = [
    "id;activity;calories;day;distance;end_datetime;intensity;label;source;start_datetime",
    `w1;running;702.5;2026-10-12;${EXPECTED.distance.toFixed(1)};${iso(end)};hard;;confirmed;${iso(START_MS)}`,
    `w2;dance;111.6;2026-10-12;;2026-10-12T22:55:00.000+02:00;moderate;;confirmed;2026-10-12T22:27:00.000+02:00`,
  ].join("\n");
  const hr = [
    "timestamp;bpm;source",
    `2026-10-12T04:59:00.000Z;55;awake`,
    ...POINTS.filter((p) => p.t % hrEvery === 0).map((p) => `${new Date(p.ms).toISOString()};${p.hr};workout`),
  ].join("\n");
  return zip("oura_export.zip", {
    "sleepmodel.csv": strToU8(sleep),
    "workout.csv": strToU8(workout),
    "heartrate.csv": strToU8(hr),
    "vo2max.csv": strToU8("id;day;timestamp;vo2_max\nv1;2026-10-12;2026-10-12T00:00:00.000+00:00;49"),
    "dailysleep.csv": strToU8("id;contributors;day;score;timestamp"),
  });
}

// ---------------------------------------------------------------- WHOOP

export function whoopExport() {
  const cycles = [
    "﻿Cycle start time,Cycle end time,Cycle timezone,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min),In bed duration (min),Light sleep duration (min),Deep (SWS) duration (min),REM duration (min),Awake duration (min),Sleep need (min),Sleep debt (min),Sleep efficiency %,Sleep consistency %",
    "2026-10-11 23:30:00,2026-10-12 23:10:00,UTC+02:00,80,49,72.0,33.1,96.5,14.2,2900,170,80,2026-10-11 23:30:00,2026-10-12 06:45:00,90,15.2,420,445,200,90,110,25,480,20,94,80",
  ].join("\n");
  const start = wall(START_MS, BERLIN);
  const end = wall(START_MS + DURATION * 1000, BERLIN);
  const workouts = [
    "Cycle start time,Cycle end time,Cycle timezone,Workout start time,Workout end time,Duration (min),Activity name,Activity Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),HR Zone 1 %,HR Zone 2 %,HR Zone 3 %,HR Zone 4 %,HR Zone 5 %,GPS enabled,Distance (meters),Altitude gain (meters),Altitude change (meters)",
    `2026-10-11 23:30:00,2026-10-12 23:10:00,UTC+02:00,${start},${end},${DURATION / 60},Running,12.1,702,${EXPECTED.maxHr},${EXPECTED.avgHr},5,20,50,25,0,true,${EXPECTED.distance.toFixed(0)},${EXPECTED.elevationGain},0`,
    `2026-10-11 23:30:00,2026-10-12 23:10:00,UTC+02:00,2026-10-12 18:00:00,2026-10-12 19:00:00,60,Weightlifting,8.0,300,140,110,40,40,20,0,0,false,,,`,
  ].join("\n");
  return zip("my_whoop_data_2026_10_19.zip", { "physiological_cycles.csv": strToU8(cycles), "workouts.csv": strToU8(workouts), "sleeps.csv": strToU8("Cycle start time"), "journal_entries.csv": strToU8("Cycle start time") });
}

// ---------------------------------------------------------------- Fitbit

/** Google Takeout: Fitbit/Global Export Data/ JSON (UTC start times, distance in the stated unit). */
export function fitbitTakeout() {
  const d = new Date(START_MS);
  const startTime = `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${String(d.getUTCFullYear()).slice(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const exercises = [
    {
      logId: 51528206052,
      activityName: "Run",
      activityTypeId: 90009,
      averageHeartRate: EXPECTED.avgHr,
      calories: 702,
      distance: EXPECTED.distance / 1609.344,
      distanceUnit: "Mile",
      duration: (DURATION + 60) * 1000,
      activeDuration: DURATION * 1000,
      steps: EXPECTED.cadence * (DURATION / 60),
      source: { type: "tracker", name: "Charge 6" },
      logType: "tracker",
      startTime,
      hasGps: true,
    },
    { logId: 2, activityName: "Walk", averageHeartRate: 100, calories: 94, duration: 1_025_000, activeDuration: 1_025_000, steps: 1004, startTime, logType: "auto_detected" },
    // An accidental 30-metre "run", and a watch left running for 11 hours.
    { logId: 3, activityName: "Run", distance: 0.02, distanceUnit: "Mile", duration: 22_000, activeDuration: 20_000, startTime: "10/13/26 18:38:23" },
    { logId: 4, activityName: "Run", distance: 0.53, distanceUnit: "Mile", duration: 40_932_000, activeDuration: 40_932_000, startTime: "10/14/26 02:05:00" },
  ];
  return zip("takeout-20261019T080000Z-001.zip", {
    Takeout: {
      Fitbit: {
        "Global Export Data": {
          "exercise-0.json": strToU8(JSON.stringify(exercises)),
          "resting_heart_rate-2026-10-12.json": strToU8(JSON.stringify([{ dateTime: "10/12/26 00:00:00", value: { date: "10/12/26", value: 51.4, error: 6.2 } }, { dateTime: "10/13/26 00:00:00", value: { date: "10/13/26", value: 0, error: 0 } }])),
        },
        "Heart Rate Variability": { "Daily Heart Rate Variability Summary - 2026-10-(12).csv": strToU8("timestamp,rmssd,nremhr,entropy\n2026-10-12T00:00:00,44.2,49.6,2.4\n") },
      },
    },
  });
}
