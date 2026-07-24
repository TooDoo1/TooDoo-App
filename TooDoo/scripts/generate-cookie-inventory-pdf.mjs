/**
 * TooDoo Mobilapp — cookie- och lagringsinventering (PDF).
 * Kör: npm run generate:cookie-inventory
 * Källa: ENTRIES nedan (verifierad mot kodbasen 2026-07-03).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'docs');
const OUT_FILE = path.join(OUT_DIR, 'toodoo-cookieinventering-mobilapp-v1.pdf');

const GENERATED_DATE = '2026-07-03';
const VERSION = 1;

/** @typedef {'nödvändig' | 'funktionell' | 'marknadsföring'} Kategori */

/**
 * @type {Array<{
 *   namn: string;
 *   typ: string;
 *   kategori: Kategori;
 *   syfte: string;
 *   varaktighet: string;
 *   när: string;
 *   omfattning: string;
 * }>}
 */
export const ENTRIES = [
  {
    namn: 'toodoo_auth_token',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'nödvändig',
    syfte: 'Lagrar åtkomsttoken (JWT) för inloggad session så att användaren förblir inloggad mellan appstarter.',
    varaktighet: 'Tills utloggning eller att lagringen rensas manuellt.',
    när: 'Vid lyckad inloggning eller tokenförnyelse.',
    omfattning: 'Endast inloggade användare.',
  },
  {
    namn: 'toodoo_auth_refresh_token',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'nödvändig',
    syfte: 'Lagrar refresh-token för att förnya åtkomsttoken utan ny inloggning.',
    varaktighet: 'Tills utloggning eller att lagringen rensas manuellt.',
    när: 'Vid lyckad inloggning om backend skickar refresh-token.',
    omfattning: 'Endast inloggade användare (när refresh-token utfärdas).',
  },
  {
    namn: 'toodoo_auth_role',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'nödvändig',
    syfte: 'Lagrar användarroll (t.ex. USER eller COMPANY) för att visa rätt funktioner i appen.',
    varaktighet: 'Tills utloggning eller att lagringen rensas manuellt.',
    när: 'Vid lyckad inloggning.',
    omfattning: 'Endast inloggade användare.',
  },
  {
    namn: 'toodoo.legalConsentAccepted',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'nödvändig',
    syfte: 'Minns att användaren godkänt användarvillkor och integritetspolicy vid första start.',
    varaktighet: 'Tills appen avinstalleras eller lagring rensas.',
    när: 'När användaren kryssar i godkännande och trycker Fortsätt i juridikdialogen.',
    omfattning: 'Alla användare (första start).',
  },
  {
    namn: 'toodoo.onboardingSeen',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'nödvändig',
    syfte: 'Minns att introduktions/onboarding-vyn har visats så att den inte upprepas varje gång.',
    varaktighet: 'Tills appen avinstalleras eller lagring rensas.',
    när: 'När användaren slutför eller hoppar över onboarding.',
    omfattning: 'Alla användare (efter juridikgodkännande).',
  },
  {
    namn: 'toodoo_favorite_business_ids_{användarId}',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'nödvändig',
    syfte: 'Lokal kopia av användarens favoritmarkerade företag för snabb visning och som reserv om API-svar saknar favoritlista.',
    varaktighet: 'Tills utloggning, borttagning av favorit eller att lagring rensas. Nyckeln innehåller användarens id eller e-post.',
    när: 'Vid hämtning av /user/me eller när användaren togglar favorit.',
    omfattning: 'Inloggade användare med roll USER.',
  },
  {
    namn: 'Google Maps (inbäddad karta, WebView)',
    typ: 'HTTP-cookie / DOM-lagring (tredjepart i WebView, iOS/Android)',
    kategori: 'nödvändig',
    syfte: 'Google Maps kan sätta egna cookies och lokal lagring i WebView när företagskartan visas under Hitta hit. Appen sätter inte dessa cookies själv.',
    varaktighet: 'Enligt Googles policy; gäller under och efter kartvisning i WebView.',
    när: 'När användaren öppnar företagsdetalj med inbäddad karta (ej web-exportens iframe på samma sätt).',
    omfattning: 'Alla som visar kartan i native-appen.',
  },
  {
    namn: 'toodoo.themeMode',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'funktionell',
    syfte: 'Sparar valt färgtema (ljus, mörk eller följ system).',
    varaktighet: 'Tills användaren byter tema eller lagring rensas.',
    när: 'När användaren ändrar utseende i appen.',
    omfattning: 'Alla användare.',
  },
  {
    namn: 'toodoo_geocode_{normaliseradAdress}',
    typ: 'AsyncStorage (endast iOS/Android)',
    kategori: 'funktionell',
    syfte: 'Cache av geokodade koordinater för adresser (avstånd Nära dig), minskar upprepade nätverksanrop.',
    varaktighet: 'Tills lagring rensas eller appen avinstalleras; även misslyckade sökningar kan cachas.',
    när: 'Vid geokodning av företagsadress på native.',
    omfattning: 'Alla som använder platsbaserade avstånd (native).',
  },
  {
    namn: 'toodoo_business_image_url_{företagsId}',
    typ: 'AsyncStorage (iOS/Android), localStorage (web/PWA)',
    kategori: 'funktionell',
    syfte: 'Cache av bild-URL per företag för snabbare listor och erbjudandekort.',
    varaktighet: 'Tills lagring rensas eller appen avinstalleras.',
    när: 'När appen hämtar eller hydrerar företagsbilder.',
    omfattning: 'Alla användare.',
  },
  {
    namn: 'toodoo_seen_offer_ids_{användarId}',
    typ: 'AsyncStorage (endast iOS/Android)',
    kategori: 'funktionell',
    syfte: 'Håller reda på vilka erbjudande-id:n som redan setts för att undvika upprepade lokala notiser om nya erbjudanden från favoriter.',
    varaktighet: 'Tills lagring rensas eller appen avinstalleras.',
    när: 'Vid bakgrundsskanning av favoritföretags erbjudanden (efter inloggning).',
    omfattning: 'Inloggade USER på native; kräver notisbehörighet för leverans.',
  },
  {
    namn: 'toodoo_splash_seen',
    typ: 'sessionStorage (endast web/PWA)',
    kategori: 'funktionell',
    syfte: 'Minns att uppstartssplash/intro redan visats i aktuell webbläsarflik så att den inte upprepas vid omladdning.',
    varaktighet: 'Tills webbläsarfliken stängs (sessionslagring).',
    när: 'Efter första genomförda uppstartssplash på web.',
    omfattning: 'Web/PWA-användare.',
  },
];

const AUDIT_SOURCES = [
  'lib/auth-session.ts',
  'lib/legal-consent-storage.ts',
  'lib/onboarding-storage.ts',
  'context/favorites-context.tsx',
  'context/favorite-offer-notifications.tsx',
  'context/theme-preference-context.tsx',
  'lib/geo.ts',
  'lib/business-image.ts',
  'app/_layout.tsx',
  'components/ui/offer-map.native.tsx',
  'package.json / app.json (beroenden)',
];

const EXCLUDED = [
  'expo-secure-store / Keychain / MMKV — inte integrerat.',
  'Sentry, Firebase Analytics, Amplitude, Mixpanel, Facebook SDK, AppsFlyer, OneSignal — inga SDK:er i package.json.',
  'toodoo_user_email, toodoo_business_id, inbjudningstokens (manager/worker) — används i webbportalen, inte i mobilappen.',
  'Minnes-cache (home-list-cache, catalog-cache, company-detail-cache) — sparas inte på enhet mellan sessioner.',
  'Registreringsdata (pendingRegistration) — endast i RAM under registreringsflödet.',
  'Expo push-token — hämtas vid behov och skickas till backend; ingen egen AsyncStorage-nyckel.',
  'expo-image disk-cache — hanteras av SDK utan appdefinierade nycklar.',
  'Workbox precache (web build) — Cache API för statiska filer, inga namngivna cookie/localStorage-nycklar.',
  'Lightning-intro WebView — lokal HTML, inga externa cookies.',
  'Webbläsarcookies från Vercel/App Store/Play Store — infrastruktur utanför appen.',
];

function countByKategori(kategori) {
  return ENTRIES.filter((e) => e.kategori === kategori).length;
}

function generatePdf() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const stream = fs.createWriteStream(OUT_FILE);
  doc.pipe(stream);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.fontSize(22).font('Helvetica-Bold').text('TooDoo Mobilapp', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(16).font('Helvetica').text('Cookie- och lagringsinventering', { align: 'left' });
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .fillColor('#444444')
    .text(`Version ${VERSION} · Genererad ${GENERATED_DATE}`, { align: 'left' });
  doc.fillColor('#000000');
  doc.moveDown(1.2);

  doc.fontSize(11).font('Helvetica');
  doc.text(
    'Denna inventering gäller endast den aktuella produktionskoden för TooDoo Mobilapp (Expo SDK 54, React Native 0.81, version 1.0.1). ' +
      'På mobil plattform motsvarar AsyncStorage (och på web/PWA localStorage) de lagringsmekanismer som cookies används för i webbläsaren, i enlighet med integritetspolicyn. ' +
      'Ingen marknadsförings- eller analysspårning är integrerad i appen. Tredjepartscookies kan förekomma endast i inbäddad Google Maps-karta (native WebView).',
    { width: pageWidth, align: 'justify' }
  );
  doc.moveDown(1);

  const necessary = countByKategori('nödvändig');
  const functional = countByKategori('funktionell');
  const marketing = countByKategori('marknadsföring');

  doc.font('Helvetica-Bold').text('Sammanfattning', { underline: true });
  doc.moveDown(0.4);
  doc.font('Helvetica').text(
    `${ENTRIES.length} poster · ${necessary} nödvändiga · ${functional} funktionella · ${marketing} marknadsföring/analys`
  );
  doc.moveDown(1);

  doc.font('Helvetica-Bold').text('Nödvändiga', { underline: true });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(
    'Krävs för inloggning, juridikgodkännande, onboarding, favoriter och kartfunktion (inkl. eventuella Google Maps-cookies i WebView).',
    { width: pageWidth }
  );
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).text('Funktionella', { underline: true });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).text(
    'Förbättrar upplevelsen: tema, cache för geokodning och bilder, notishistorik för favoriter, samt webbsplash i sessionStorage.',
    { width: pageWidth }
  );
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(12).text('Detaljerad förteckning', { underline: true });
  doc.moveDown(0.8);

  const order = ['nödvändig', 'funktionell', 'marknadsföring'];
  let index = 1;

  for (const kategori of order) {
    const group = ENTRIES.filter((e) => e.kategori === kategori);
    for (const entry of group) {
      if (doc.y > doc.page.height - 160) {
        doc.addPage();
      }

      const kategoriLabel =
        kategori === 'nödvändig'
          ? 'Nödvändig'
          : kategori === 'funktionell'
            ? 'Funktionell'
            : 'Marknadsföring/analys';

      doc.font('Helvetica-Bold').fontSize(11).text(`${index}. ${entry.namn}`);
      index += 1;
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(10);
      const fields = [
        ['Typ', entry.typ],
        ['Kategori', kategoriLabel],
        ['Syfte', entry.syfte],
        ['Varaktighet', entry.varaktighet],
        ['När den sätts', entry.när],
        ['Omfattning', entry.omfattning],
      ];
      for (const [label, value] of fields) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value, { width: pageWidth });
        doc.moveDown(0.15);
      }
      doc.moveDown(0.6);
    }
  }

  if (doc.y > doc.page.height - 200) {
    doc.addPage();
  }

  doc.font('Helvetica-Bold').fontSize(11).text('Teknisk not', { underline: true });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9);
  doc.text(
    'Granskning genomförd genom statisk kodanalys av TooDoo/ (Expo Router-app). Varje post har spårats från appstart (app/_layout.tsx) via providers och moduler som faktiskt skriver lagring. AsyncStorage-importer i filer utan setItem (t.ex. app/(tabs)/index.tsx) ingår inte. Native iOS/Android-release byggs via EAS (eas.json); web/PWA via expo export + Workbox.',
    { width: pageWidth }
  );
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Granskade källfiler:', { underline: false });
  doc.font('Helvetica');
  for (const file of AUDIT_SOURCES) {
    doc.text(`• ${file}`);
  }
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Explicit undantagna (ej i förteckningen):', { underline: false });
  doc.font('Helvetica');
  for (const item of EXCLUDED) {
    doc.text(`• ${item}`, { width: pageWidth });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(OUT_FILE));
    stream.on('error', reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generatePdf()
    .then((out) => {
      console.log(`PDF skapad: ${out}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
