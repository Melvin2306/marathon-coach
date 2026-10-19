import type { Locale } from "@/i18n/config";
import { OperatorAddress, Prose } from "@/components/prose";
import { OPERATOR, REPO_URL } from "@/lib/site";

export function Imprint({ locale }: { locale: Locale }) {
  return locale === "de" ? (
    <Prose>
      <h1>Impressum</h1>
      <h2>Angaben gemäß § 5 DDG</h2>
      <OperatorAddress locale={locale} />
      <p>M42 ist ein privates Projekt. Es wird nicht von der Langdock GmbH betrieben; nichts auf dieser Website ist eine Aussage der Langdock GmbH oder in ihrem Namen.</p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>{OPERATOR.name}, Anschrift wie oben.</p>

      <h2>Keine medizinische Beratung</h2>
      <p>
        Trainingspläne, Tempos und Hinweise in M42 werden automatisch aus deinen Angaben berechnet und ersetzen keine ärztliche oder trainingswissenschaftliche Beratung. Hör auf deinen Körper und lass dich bei Beschwerden ärztlich untersuchen.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Diese Website enthält Links zu externen Websites, auf deren Inhalte ich keinen Einfluss habe. Für diese Inhalte ist der jeweilige Anbieter verantwortlich. Werden mir Rechtsverletzungen bekannt, entferne ich die betreffenden Links umgehend.
      </p>

      <h2>Marken</h2>
      <p>Strava und Apple Health sind Marken ihrer jeweiligen Inhaber. M42 steht in keiner Verbindung zu Strava, Inc. oder Apple Inc.</p>

      <h2>Urheberrecht</h2>
      <p>
        Die Inhalte dieser Website unterliegen dem deutschen Urheberrecht. Der Quellcode ist öffentlich auf <a href={REPO_URL}>GitHub</a> einsehbar.
      </p>
    </Prose>
  ) : (
    <Prose>
      <h1>Imprint</h1>
      <h2>Information pursuant to § 5 DDG</h2>
      <OperatorAddress locale={locale} />
      <p>M42 is a personal project. It is not operated by Langdock GmbH, and nothing on this site is a statement by or on behalf of Langdock GmbH.</p>

      <h2>Responsible for the content (§ 18 (2) MStV)</h2>
      <p>{OPERATOR.name}, address as above.</p>

      <h2>No medical advice</h2>
      <p>
        Training plans, paces and advice in M42 are calculated automatically from what you enter and do not replace medical or professional coaching advice. Listen to your body and see a doctor if something hurts.
      </p>

      <h2>Liability for links</h2>
      <p>
        This site links to external websites whose content I don&apos;t control; their providers are responsible for it. If I become aware of an infringement, I&apos;ll remove the link straight away.
      </p>

      <h2>Trademarks</h2>
      <p>Strava and Apple Health are trademarks of their respective owners. M42 is not affiliated with Strava, Inc. or Apple Inc.</p>

      <h2>Copyright</h2>
      <p>
        The content of this site is subject to German copyright law. The source code is publicly available on <a href={REPO_URL}>GitHub</a>.
      </p>
    </Prose>
  );
}
