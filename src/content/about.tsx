import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LogoMark } from "@/components/logo";
import { Prose } from "@/components/prose";
import { OPERATOR, REPO_URL } from "@/lib/site";

const METHODOLOGY_URL = `${REPO_URL}#methodology-and-sources`;

export function About({ locale }: { locale: Locale }) {
  const href = (path: string) => `/${locale}${path}`;
  return (
    <Prose>
      <div className="flex items-center gap-4">
        <LogoMark size={56} />
        <h1>{locale === "de" ? "Über M42" : "About M42"}</h1>
      </div>
      {locale === "de" ? (
        <>
          <p className="text-lg">
            M42 ist ein kostenloser Marathon-Trainingscoach. Er baut dir einen Plan bis zum Renntag, rechnet deine Tempos aus deiner tatsächlichen Form und zeigt anhand deiner Läufe, ob du auf Kurs bist. Der
            Name ist die Distanz: 42,195 km. Das Logo ist ein „M“, gezeichnet als Streckenprofil: zwei Anstiege, dann das Ziel.
          </p>

          <h2>Was M42 kann</h2>
          <ul>
            <li>Ein periodisierter Plan von deinem Trainingsbeginn bis zum Renntag: Grundlage, Aufbau, marathonspezifisch und Tapering.</li>
            <li>Persönliche Tempos und Herzfrequenzzonen, die sich mit bestätigtem Fortschritt weiterentwickeln.</li>
            <li>Import aus Apple Health, Garmin, Strava, Polar, Oura, WHOOP, Fitbit und FIT-/GPX-/TCX-Dateien jeder Uhr, mit Herzfrequenz-, Tempo- und Höhenkurven, Laufdynamik, Ruhepuls und HRV.</li>
            <li>Fortschritt auf einen Blick: realistische Zielzeit, Pace bei gleicher Herzfrequenz, Beständigkeit und Intensitätsverteilung.</li>
            <li>Ein Laufband-Modus mit Geschwindigkeit, Steigung und Ablauf für jede Einheit, auf Deutsch und Englisch.</li>
          </ul>

          <h2>Auf Basis von Forschung</h2>
          <p>
            Die Berechnungen folgen veröffentlichten Daten und Studien statt Bauchgefühl: Tempos nach dem VDOT-Modell von Jack Daniels, realistische Marathonzeiten nach Vickers &amp; Vertosick (2016), eine
            Belastungssteigerung, die große Sprünge einzelner Läufe vermeidet (Frandsen et al. 2025), und ein dreiwöchiges Tapering (Bosquet et al. 2007; Smyth &amp; Lawlor 2021). Alle Annahmen und Quellen stehen in
            der <a href={METHODOLOGY_URL}>Methodik im Repository</a>.
          </p>

          <h2>Deine Daten bleiben bei dir</h2>
          <p>
            Es gibt kein Konto und kein Tracking. Alles, was du einträgst oder importierst, bleibt im Browser auf deinem Gerät. Details stehen in der <Link href={href("/privacy")}>Datenschutzerklärung</Link>.
          </p>

          <h2>Open Source</h2>
          <p>
            Der Quellcode ist öffentlich auf <a href={REPO_URL}>GitHub</a>. Gebaut mit Next.js, React, TypeScript und Tailwind CSS. Fehler und Ideen gerne als Issue im Repository.
          </p>

          <h2>Wer dahintersteckt</h2>
          <p>
            Ich bin {OPERATOR.name}, Platform Engineer in Berlin. M42 habe ich gebaut, um mich selbst auf einen Marathon vorzubereiten. Mehr über mich auf <a href={OPERATOR.website}>rinkleff.dev</a> und{" "}
            <a href={OPERATOR.github}>GitHub</a>.
          </p>

          <h2>Wichtig</h2>
          <p>
            M42 ersetzt keine ärztliche oder trainingswissenschaftliche Beratung. Hör auf deinen Körper. M42 steht in keiner Verbindung zu Apple, Garmin, Strava, Polar, Oura, WHOOP, Google oder anderen genannten Anbietern. Siehe <Link href={href("/imprint")}>Impressum</Link>.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg">
            M42 is a free marathon training coach. It builds your plan to race day, sets your paces from your actual fitness and uses your runs to show whether you&apos;re on track. The name is the distance:
            42.195 km. The logo is an “M” drawn as a course profile: two climbs, then the finish.
          </p>

          <h2>What M42 does</h2>
          <ul>
            <li>A periodised plan from your training start to race day: base, build, marathon-specific and taper.</li>
            <li>Personal paces and heart-rate zones that step up as your progress is confirmed.</li>
            <li>Import from Apple Health, Garmin, Strava, Polar, Oura, WHOOP, Fitbit and FIT/GPX/TCX files from any watch, with heart-rate, pace and elevation curves, running dynamics, resting heart rate and HRV.</li>
            <li>Progress at a glance: realistic race time, pace at the same heart rate, consistency and intensity mix.</li>
            <li>A treadmill mode with speed, incline and steps for every session, in English and German.</li>
          </ul>

          <h2>Built on research</h2>
          <p>
            The calculations follow published data and studies rather than gut feeling: paces from Jack Daniels&apos; VDOT model, realistic marathon times from Vickers &amp; Vertosick (2016), load progression that
            avoids big single-run jumps (Frandsen et al. 2025) and a three-week taper (Bosquet et al. 2007; Smyth &amp; Lawlor 2021). Every assumption and source is listed in the{" "}
            <a href={METHODOLOGY_URL}>methodology in the repository</a>.
          </p>

          <h2>Your data stays yours</h2>
          <p>
            There&apos;s no account and no tracking. Everything you enter or import stays in the browser on your device. Details are in the <Link href={href("/privacy")}>privacy policy</Link>.
          </p>

          <h2>Open source</h2>
          <p>
            The source code is public on <a href={REPO_URL}>GitHub</a>. Built with Next.js, React, TypeScript and Tailwind CSS. Bugs and ideas are welcome as issues in the repository.
          </p>

          <h2>Who&apos;s behind it</h2>
          <p>
            I&apos;m {OPERATOR.name}, a platform engineer in Berlin. I built M42 to prepare for a marathon myself. More about me at <a href={OPERATOR.website}>rinkleff.dev</a> and on{" "}
            <a href={OPERATOR.github}>GitHub</a>.
          </p>

          <h2>Good to know</h2>
          <p>
            M42 doesn&apos;t replace medical or professional coaching advice. Listen to your body. M42 is not affiliated with Apple, Garmin, Strava, Polar, Oura, WHOOP, Google or any other provider named. See the <Link href={href("/imprint")}>imprint</Link>.
          </p>
        </>
      )}
    </Prose>
  );
}
