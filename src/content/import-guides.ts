// Step-by-step instructions for getting each provider's export. Menu names
// change between app versions, so each guide links the provider's own help
// page as the reference.
import type { Locale } from "@/i18n/config";

export type GuideId = "apple-health" | "garmin" | "strava" | "polar" | "watches" | "oura" | "whoop" | "fitbit";

/** What M42 gets out of an export. */
export type Yield = "curves" | "summaries" | "recovery";

export interface Guide {
  id: GuideId;
  name: string;
  /** how long until the export arrives */
  wait: string;
  yields: Yield[];
  steps: string[];
  /** extra hint shown under the steps */
  tip?: string;
  link?: { label: string; href: string };
}

const EN: Guide[] = [
  {
    id: "apple-health",
    name: "Apple Health (Apple Watch, iPhone)",
    wait: "Instant",
    yields: ["curves", "recovery"],
    steps: [
      "On your iPhone, open the Health app and tap your profile picture at the top right.",
      "Scroll down and tap “Export All Health Data”, then “Export”. Preparing it can take a few minutes.",
      "In the share sheet, tap “Save to Files” (or AirDrop it to your Mac).",
      "Choose the export.zip here. There's no need to unzip it.",
    ],
    tip: "Using M42 on your iPhone? Then you can do all of this on the phone: save the export to Files and pick it right away.",
    link: { label: "Apple's guide", href: "https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios" },
  },
  {
    id: "garmin",
    name: "Garmin Connect",
    wait: "A few hours to days",
    yields: ["curves", "recovery"],
    steps: [
      "Sign in at garmin.com/account and open “Data Management”.",
      "Choose “Export Your Data”, then “Request Data Export”.",
      "Garmin emails you a download link when the archive is ready.",
      "Choose the downloaded ZIP here as it is. M42 reads the original FIT recordings inside it.",
    ],
    tip: "For a single run: open it in Garmin Connect, click the gear icon and choose “Export Original”, then upload the .fit (or the ZIP it comes in).",
    link: { label: "Garmin's export page", href: "https://www.garmin.com/account/datamanagement/exportdata/" },
  },
  {
    id: "strava",
    name: "Strava",
    wait: "Usually within a few hours",
    yields: ["curves"],
    steps: [
      "On strava.com (not the app), open Settings → My Account.",
      "Under “Download your account”, click “Get Started”, then “Request download”.",
      "Strava emails you a link. Download the ZIP.",
      "Choose the ZIP here. Your run names and perceived exertion come along.",
    ],
    tip: "Strava's archive also holds the original files from any watch that syncs to Strava (COROS, Suunto, Samsung, …), so it's the easiest way to bring in a long history.",
    link: { label: "Strava's guide", href: "https://support.strava.com/hc/en-us/articles/216918437" },
  },
  {
    id: "polar",
    name: "Polar Flow",
    wait: "A few hours to days",
    yields: ["curves"],
    steps: [
      "Sign in at account.polar.com.",
      "Click “Download your data” in the left-hand menu, then “Download”.",
      "Polar emails you when it's ready; the link works for two weeks.",
      "Choose the ZIP here. M42 reads the training sessions in it.",
    ],
    link: { label: "Polar's guide", href: "https://support.polar.com/en/how-to-download-all-your-data-from-polar-flow" },
  },
  {
    id: "watches",
    name: "COROS, Suunto, Wahoo and other watches",
    wait: "Instant",
    yields: ["curves"],
    steps: [
      "In your watch's app or website, open a run and look for “Export” (sometimes under ⋯ or Share).",
      "Pick the FIT format if offered; TCX and GPX work too.",
      "Choose one or several files here, or a ZIP containing them.",
    ],
    tip: "For your whole history at once, let the watch sync to Strava or Apple Health and import that export instead.",
  },
  {
    id: "oura",
    name: "Oura",
    wait: "Up to 10 days",
    yields: ["recovery", "summaries"],
    steps: [
      "Open membership.ouraring.com/data-export and sign in.",
      "Under “Export data”, tap “Request your data”.",
      "When Oura emails you, download the ZIP from the same page.",
      "Choose the ZIP here. M42 reads your nightly lowest heart rate, HRV, VO₂max and running workouts.",
    ],
    link: { label: "Oura's guide", href: "https://support.ouraring.com/hc/en-us/articles/360025441594" },
  },
  {
    id: "whoop",
    name: "WHOOP",
    wait: "Up to 24 hours",
    yields: ["recovery", "summaries"],
    steps: [
      "In the WHOOP app, open More → App Settings → Data Export (the name varies a little between app versions).",
      "Tap “Create Export”.",
      "WHOOP emails you a download link.",
      "Choose the ZIP here. M42 reads resting heart rate, HRV and your runs (averages only, WHOOP exports no curves).",
    ],
  },
  {
    id: "fitbit",
    name: "Fitbit / Google Health",
    wait: "Up to a few days",
    yields: ["recovery", "summaries"],
    steps: [
      "Open takeout.google.com, click “Deselect all” and select only Fitbit (called “Google Health” on some accounts).",
      "Create the export. Google emails you when it's ready.",
      "Download the ZIP (large exports come in several parts).",
      "Choose all parts here at once. M42 reads runs, resting heart rate and HRV.",
    ],
    link: { label: "Google's guide", href: "https://support.google.com/fitbit/answer/14236615" },
  },
];

const DE: Guide[] = [
  {
    id: "apple-health",
    name: "Apple Health (Apple Watch, iPhone)",
    wait: "Sofort",
    yields: ["curves", "recovery"],
    steps: [
      "Öffne auf dem iPhone die Health-App und tippe oben rechts auf dein Profilbild.",
      "Scrolle nach unten, tippe auf „Alle Gesundheitsdaten exportieren“ und dann auf „Exportieren“. Das Vorbereiten kann einige Minuten dauern.",
      "Tippe im Teilen-Menü auf „In Dateien sichern“ (oder schick sie per AirDrop an deinen Mac).",
      "Wähle hier die export.zip aus. Entpacken ist nicht nötig.",
    ],
    tip: "Nutzt du M42 auf dem iPhone? Dann geht alles direkt auf dem Telefon: Export in Dateien sichern und gleich hier auswählen.",
    link: { label: "Anleitung von Apple", href: "https://support.apple.com/de-de/guide/iphone/share-your-health-data-iph5ede58c3d/ios" },
  },
  {
    id: "garmin",
    name: "Garmin Connect",
    wait: "Einige Stunden bis Tage",
    yields: ["curves", "recovery"],
    steps: [
      "Melde dich auf garmin.com/account an und öffne „Datenverwaltung“.",
      "Wähle „Deine Daten exportieren“ und dann „Datenexport anfordern“.",
      "Garmin schickt dir einen Download-Link per E-Mail, sobald das Archiv fertig ist.",
      "Wähle hier die heruntergeladene ZIP-Datei unverändert aus. M42 liest die darin enthaltenen Original-FIT-Aufzeichnungen.",
    ],
    tip: "Für einen einzelnen Lauf: Öffne ihn in Garmin Connect, klicke auf das Zahnrad und wähle „Original exportieren“. Lade dann die .fit (oder die ZIP, in der sie kommt) hoch.",
    link: { label: "Exportseite von Garmin", href: "https://www.garmin.com/de-DE/account/datamanagement/exportdata/" },
  },
  {
    id: "strava",
    name: "Strava",
    wait: "Meist innerhalb weniger Stunden",
    yields: ["curves"],
    steps: [
      "Öffne auf strava.com (nicht in der App) Einstellungen → Mein Konto.",
      "Klicke im Bereich zum Herunterladen deines Accounts auf „Los geht’s“ und fordere dann den Download an.",
      "Strava schickt dir einen Link per E-Mail. Lade die ZIP-Datei herunter.",
      "Wähle hier die ZIP-Datei aus. Namen deiner Läufe und dein Anstrengungsempfinden werden übernommen.",
    ],
    tip: "Das Strava-Archiv enthält auch die Originaldateien jeder Uhr, die mit Strava synchronisiert (COROS, Suunto, Samsung, …). So holst du eine lange Historie am einfachsten.",
    link: { label: "Anleitung von Strava", href: "https://support.strava.com/hc/de/articles/216918437" },
  },
  {
    id: "polar",
    name: "Polar Flow",
    wait: "Einige Stunden bis Tage",
    yields: ["curves"],
    steps: [
      "Melde dich auf account.polar.com an.",
      "Klicke im Menü links auf „Deine Daten herunterladen“ und dann auf „Herunterladen“.",
      "Polar schickt dir eine E-Mail, sobald er fertig ist; der Link gilt zwei Wochen.",
      "Wähle hier die ZIP-Datei aus. M42 liest die enthaltenen Trainingseinheiten.",
    ],
    link: { label: "Anleitung von Polar", href: "https://support.polar.com/de/how-to-download-all-your-data-from-polar-flow" },
  },
  {
    id: "watches",
    name: "COROS, Suunto, Wahoo und andere Uhren",
    wait: "Sofort",
    yields: ["curves"],
    steps: [
      "Öffne in der App oder auf der Website deiner Uhr einen Lauf und suche nach „Exportieren“ (manchmal unter ⋯ oder Teilen).",
      "Wähle wenn möglich das FIT-Format; TCX und GPX funktionieren auch.",
      "Wähle hier eine oder mehrere Dateien aus, oder eine ZIP-Datei, die sie enthält.",
    ],
    tip: "Für die ganze Historie auf einmal: Lass die Uhr mit Strava oder Apple Health synchronisieren und importiere deren Export.",
  },
  {
    id: "oura",
    name: "Oura",
    wait: "Bis zu 10 Tage",
    yields: ["recovery", "summaries"],
    steps: [
      "Öffne membership.ouraring.com/data-export und melde dich an.",
      "Tippe unter „Daten exportieren“ auf „Daten anfordern“.",
      "Sobald Oura dir eine E-Mail schickt, lade die ZIP-Datei auf derselben Seite herunter.",
      "Wähle hier die ZIP-Datei aus. M42 liest deinen niedrigsten Nachtpuls, HRV, VO₂max und deine Lauf-Workouts.",
    ],
    link: { label: "Anleitung von Oura", href: "https://support.ouraring.com/hc/de/articles/360025441594" },
  },
  {
    id: "whoop",
    name: "WHOOP",
    wait: "Bis zu 24 Stunden",
    yields: ["recovery", "summaries"],
    steps: [
      "Öffne in der WHOOP-App Mehr → App-Einstellungen → Datenexport (die Bezeichnung variiert je nach App-Version).",
      "Tippe auf „Export erstellen“.",
      "WHOOP schickt dir einen Download-Link per E-Mail.",
      "Wähle hier die ZIP-Datei aus. M42 liest Ruhepuls, HRV und deine Läufe (nur Durchschnittswerte, WHOOP exportiert keine Kurven).",
    ],
  },
  {
    id: "fitbit",
    name: "Fitbit / Google Health",
    wait: "Bis zu einigen Tagen",
    yields: ["recovery", "summaries"],
    steps: [
      "Öffne takeout.google.com, klicke auf „Auswahl aufheben“ und wähle nur Fitbit aus (bei manchen Konten „Google Health“).",
      "Erstelle den Export. Google schickt dir eine E-Mail, sobald er fertig ist.",
      "Lade die ZIP-Datei herunter (große Exporte kommen in mehreren Teilen).",
      "Wähle hier alle Teile auf einmal aus. M42 liest Läufe, Ruhepuls und HRV.",
    ],
    link: { label: "Anleitung von Google", href: "https://support.google.com/fitbit/answer/14236615?hl=de" },
  },
];

export const importGuides = (locale: Locale): Guide[] => (locale === "de" ? DE : EN);
