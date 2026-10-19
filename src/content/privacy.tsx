import type { Locale } from "@/i18n/config";
import { OperatorAddress, Prose, Updated } from "@/components/prose";
import { REPO_URL, STRAVA_SYNC } from "@/lib/site";

// Keep in sync with the code: cookie names and lifetimes come from
// components/nav.tsx (NEXT_LOCALE) and lib/strava/server.ts + api/strava/connect.
// The Strava account sections only apply while STRAVA_SYNC is on.

export function Privacy({ locale }: { locale: Locale }) {
  return locale === "de" ? <PrivacyDe locale={locale} /> : <PrivacyEn locale={locale} />;
}

function PrivacyEn({ locale }: { locale: Locale }) {
  return (
    <Prose>
      <h1>Privacy policy</h1>

      <h2>The short version</h2>
      <ul>
        <li>M42 has no accounts, no analytics and no tracking.</li>
        <li>Your plan, runs and health data are stored in your browser only. They never reach a server I run.</li>
        <li>Export files you import (Apple Health, Garmin, Strava, Polar, Oura, WHOOP, Fitbit, or FIT/GPX/TCX files) are read entirely in your browser and never uploaded.</li>
        {STRAVA_SYNC && <li>Only if you connect Strava do requests pass through the site&apos;s server, to fetch your activities from Strava. Nothing is stored there.</li>}
      </ul>

      <h2>Controller (Verantwortlicher)</h2>
      <OperatorAddress locale={locale} />

      <h2>Hosting</h2>
      <p>
        The site is hosted by Vercel Inc., USA, which processes data on my behalf (Art. 28 GDPR). When you load a page, Vercel necessarily receives technical data: your IP address, date and time, the
        page requested, browser and operating system, and the referring page. This is needed to deliver the site and keep it secure (Art. 6 (1) (f) GDPR). Vercel keeps these logs only for a limited
        time and is certified under the EU-US Data Privacy Framework (Art. 45 GDPR).
      </p>

      <h2>What is stored in your browser</h2>
      <p>
        Your profile, plan settings, logged and imported runs (including heart-rate data), daily health metrics and preferences are kept in your browser&apos;s local storage. They are not transmitted
        to me or anyone else. You can delete them at any time under Settings → Reset everything, or by clearing your browser data. Settings → Export backup lets you save a copy as a file.
      </p>
      <p>
        So the app also works offline, for example when installed to your home screen, your browser keeps a copy of the site&apos;s own pages, scripts and icons (a service worker cache). It
        contains no personal data and is cleared together with your browser data.
      </p>
      <p>The site sets only cookies that are strictly necessary for features you use (§ 25 (2) no. 2 TDDDG), so there is no consent banner:</p>
      <ul>
        <li>
          <strong>NEXT_LOCALE</strong>: remembers your language choice. Set when you switch language; kept for one year.
        </li>
        {STRAVA_SYNC && (
          <>
            <li>
              <strong>strava_oauth_state</strong>: protects the Strava connection against forged requests. Set when you start connecting; deleted after 10 minutes at the latest.
            </li>
            <li>
              <strong>strava_session</strong>: holds the access token Strava issues for your account, so the site can fetch your activities. HttpOnly, only sent to this site; kept for up to 180 days
              or until you disconnect.
            </li>
          </>
        )}
      </ul>

      <h2>File imports</h2>
      <p>
        When you import an export from Apple Health, Garmin Connect, Strava, Polar Flow, Oura, WHOOP or Fitbit (Google Takeout), or single activity files, the files are opened and read in your
        browser. They are never uploaded. The extracted runs and daily values (resting heart rate, heart-rate variability, VO₂max) are stored locally as described above. Heart-rate data counts as
        health data (Art. 9 GDPR); because it never leaves your device, I don&apos;t process it. The import page links to the providers&apos; own help pages, which you request your export from
        yourself.
      </p>

      {STRAVA_SYNC && (
        <>
          <h2>Strava</h2>
          <p>
            Connecting Strava is optional. When you choose &quot;Connect with Strava&quot;, you are redirected to Strava, where you decide which access to grant; Strava&apos;s own privacy policy
            applies there. After you agree, the site&apos;s server functions on Vercel use your token to request your activities, profile, totals and shoes from Strava and pass the results straight to
            your browser, where they are stored locally. Nothing is kept on the server.
          </p>
          <p>
            This processing is based on your consent (Art. 6 (1) (a) GDPR and, for heart-rate data, Art. 9 (2) (a) GDPR). You can withdraw it at any time with &quot;Disconnect&quot; on the Import
            page, which revokes the token at Strava and deletes the cookie, or in your Strava settings. Strava Inc. is based in the USA.
          </p>
        </>
      )}

      <h2>No analytics, no third-party content</h2>
      <p>
        M42 uses no analytics, advertising or tracking tools. Fonts are served from this site, not from Google. Your browser doesn&apos;t load anything from third parties
        {STRAVA_SYNC ? <>, except Strava&apos;s own pages if you connect</> : null}.
      </p>

      <h2>External links</h2>
      <p>
        The site links to other websites, such as <a href={REPO_URL}>GitHub</a> and the help pages of Apple, Garmin, Strava, Polar, Oura and Google. Their privacy policies apply once you follow a link.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the GDPR you have the right to access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object (Art. 21), and
        to withdraw consent at any time with effect for the future (Art. 7 (3)). Since your training data stays on your device, you can view, export and delete it yourself in the app. For anything
        else, email me at the address above.
      </p>
      <p>
        You also have the right to lodge a complaint with a data protection supervisory authority, for example the Berlin Commissioner for Data Protection and Freedom of Information (Berliner
        Beauftragte für Datenschutz und Informationsfreiheit) or the authority where you live.
      </p>

      <h2>Changes</h2>
      <p>If the app starts processing data differently, this policy will be updated first.</p>
      <Updated locale={locale} />
    </Prose>
  );
}

function PrivacyDe({ locale }: { locale: Locale }) {
  return (
    <Prose>
      <h1>Datenschutzerklärung</h1>

      <h2>Kurz gesagt</h2>
      <ul>
        <li>M42 hat keine Konten, keine Analyse-Tools und kein Tracking.</li>
        <li>Dein Plan, deine Läufe und deine Gesundheitsdaten werden nur in deinem Browser gespeichert. Sie erreichen keinen Server, den ich betreibe.</li>
        <li>Exportdateien, die du importierst (Apple Health, Garmin, Strava, Polar, Oura, WHOOP, Fitbit oder FIT-/GPX-/TCX-Dateien), werden vollständig in deinem Browser gelesen und nie hochgeladen.</li>
        {STRAVA_SYNC && <li>Nur wenn du Strava verbindest, laufen Anfragen über den Server der Website, um deine Aktivitäten bei Strava abzurufen. Dort wird nichts gespeichert.</li>}
      </ul>

      <h2>Verantwortlicher</h2>
      <OperatorAddress locale={locale} />

      <h2>Hosting</h2>
      <p>
        Die Website wird von Vercel Inc., USA, gehostet, die Daten in meinem Auftrag verarbeitet (Art. 28 DSGVO). Beim Aufruf einer Seite erhält Vercel zwangsläufig technische Daten: deine IP-Adresse,
        Datum und Uhrzeit, die aufgerufene Seite, Browser und Betriebssystem sowie die verweisende Seite. Das ist nötig, um die Website auszuliefern und sicher zu betreiben (Art. 6 Abs. 1 lit. f
        DSGVO). Vercel speichert diese Protokolle nur begrenzte Zeit und ist nach dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO).
      </p>

      <h2>Was in deinem Browser gespeichert wird</h2>
      <p>
        Dein Profil, deine Planeinstellungen, eingetragene und importierte Läufe (einschließlich Herzfrequenzdaten), tägliche Gesundheitswerte und Einstellungen liegen im lokalen Speicher deines
        Browsers. Sie werden weder an mich noch an andere übertragen. Du kannst sie jederzeit unter Einstellungen → Alles zurücksetzen oder durch Löschen deiner Browserdaten entfernen. Unter
        Einstellungen → Backup exportieren kannst du eine Kopie als Datei speichern.
      </p>
      <p>
        Damit die App auch offline funktioniert, etwa auf dem Home-Bildschirm installiert, speichert dein Browser eine Kopie der Seiten, Skripte und Symbole der Website (Service-Worker-Cache).
        Sie enthält keine personenbezogenen Daten und wird mit deinen Browserdaten gelöscht.
      </p>
      <p>Die Website setzt nur Cookies, die für von dir genutzte Funktionen unbedingt erforderlich sind (§ 25 Abs. 2 Nr. 2 TDDDG). Deshalb gibt es kein Cookie-Banner:</p>
      <ul>
        <li>
          <strong>NEXT_LOCALE</strong>: merkt sich deine Sprachwahl. Wird gesetzt, wenn du die Sprache wechselst; Speicherdauer ein Jahr.
        </li>
        {STRAVA_SYNC && (
          <>
            <li>
              <strong>strava_oauth_state</strong>: schützt die Strava-Verbindung vor gefälschten Anfragen. Wird beim Verbinden gesetzt und spätestens nach 10 Minuten gelöscht.
            </li>
            <li>
              <strong>strava_session</strong>: enthält das Zugriffstoken, das Strava für dein Konto ausstellt, damit die Website deine Aktivitäten abrufen kann. HttpOnly und nur an diese Website
              gesendet; gespeichert bis zu 180 Tage oder bis du die Verbindung trennst.
            </li>
          </>
        )}
      </ul>

      <h2>Datei-Importe</h2>
      <p>
        Wenn du einen Export aus Apple Health, Garmin Connect, Strava, Polar Flow, Oura, WHOOP oder Fitbit (Google Takeout) oder einzelne Aktivitätsdateien importierst, werden die Dateien in deinem
        Browser geöffnet und gelesen. Sie werden nie hochgeladen. Die ausgelesenen Läufe und Tageswerte (Ruhepuls, Herzfrequenzvariabilität, VO₂max) werden wie oben beschrieben lokal gespeichert.
        Herzfrequenzdaten sind Gesundheitsdaten (Art. 9 DSGVO); da sie dein Gerät nie verlassen, verarbeite ich sie nicht. Die Import-Seite verlinkt auf die Hilfeseiten der Anbieter, bei denen du
        deinen Export selbst anforderst.
      </p>

      {STRAVA_SYNC && (
        <>
          <h2>Strava</h2>
          <p>
            Die Verbindung mit Strava ist freiwillig. Wählst du „Mit Strava verbinden“, wirst du zu Strava weitergeleitet und entscheidest dort, welchen Zugriff du erteilst; dort gilt die
            Datenschutzerklärung von Strava. Nach deiner Zustimmung rufen die Serverfunktionen der Website bei Vercel mit deinem Token deine Aktivitäten, dein Profil, deine Gesamtwerte und Schuhe bei
            Strava ab und geben die Ergebnisse direkt an deinen Browser weiter, wo sie lokal gespeichert werden. Auf dem Server wird nichts gespeichert.
          </p>
          <p>
            Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO und für Herzfrequenzdaten Art. 9 Abs. 2 lit. a DSGVO). Du kannst sie jederzeit widerrufen: mit „Trennen“ auf der
            Import-Seite, wodurch das Token bei Strava widerrufen und das Cookie gelöscht wird, oder in deinen Strava-Einstellungen. Strava Inc. hat ihren Sitz in den USA.
          </p>
        </>
      )}

      <h2>Keine Analyse, keine Inhalte Dritter</h2>
      <p>
        M42 nutzt keine Analyse-, Werbe- oder Tracking-Tools. Schriftarten werden von dieser Website ausgeliefert, nicht von Google. Dein Browser lädt nichts von Dritten
        {STRAVA_SYNC ? <>, außer den Seiten von Strava, wenn du dich verbindest</> : null}.
      </p>

      <h2>Externe Links</h2>
      <p>
        Die Website verlinkt auf andere Websites wie <a href={REPO_URL}>GitHub</a> und die Hilfeseiten von Apple, Garmin, Strava, Polar, Oura und Google. Sobald du einem Link folgst, gelten deren Datenschutzerklärungen.
      </p>

      <h2>Deine Rechte</h2>
      <p>
        Nach der DSGVO hast du das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
        (Art. 21) sowie das Recht, eine Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3). Da deine Trainingsdaten auf deinem Gerät bleiben, kannst du sie in der App
        selbst einsehen, exportieren und löschen. Für alles andere schreib mir an die oben genannte Adresse.
      </p>
      <p>
        Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit oder der Behörde an deinem
        Wohnort.
      </p>

      <h2>Änderungen</h2>
      <p>Wenn die App Daten künftig anders verarbeitet, wird diese Erklärung vorher aktualisiert.</p>
      <Updated locale={locale} />
    </Prose>
  );
}
