/* Generuje małe, statyczne mapki miejsc spotkań do static/img/mapy/.

   Dlaczego statyczne obrazki, a nie osadzona mapa (iframe):
   osadzona mapa ładuje skrypty i cookies zewnętrznej firmy u KAŻDEGO
   odwiedzającego. Tu kafelki pobieramy raz, przy budowaniu, sklejamy
   w jeden obrazek i trzymamy na własnym serwerze — przeglądarka klienta
   nie łączy się z nikim poza naszą stroną. Pinezka NIE jest wtopiona
   w obrazek — rysuje ją CSS dokładnie na środku, a obrazek jest
   wycentrowany co do piksela na współrzędnych.

   Źródło: kafelki OpenStreetMap. Licencja wymaga podpisu
   "© autorzy OpenStreetMap" przy mapach — jest pod każdym slajderem.
   Zasady korzystania z kafelków OSM zakazują masowego pobierania;
   ten skrypt bierze 9 kafelków na miejsce, raz, z przerwami, i trzyma
   je w pamięci podręcznej — przy ponownym uruchomieniu nic nie pobiera.

   Uruchomienie (z katalogu projektu):
     node narzedzia/generuj-mapki.mjs
   Wymaga: Node 18+ i ffmpeg w PATH.

   Nowe miejsce: dopisz je do MIEJSCA niżej, uruchom skrypt, a w
   index.html dodaj kartę z <img src="img/mapy/<slug>.webp">. */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ZOOM = 16; // poziom ulic — widać okoliczne drogi, ale nie całą dzielnicę
const KAFEL = 256;
const SZER = 480; // wyświetlane ~300 px szerokości, więc jest zapas na ekrany HiDPI
const WYS = 270; // 16:9

const MIEJSCA = [
  // Dojazd bezpłatny
  { slug: 'bedzinska-km-park', lat: 52.18149683839272, lng: 21.190286834215232 },
  { slug: 'zerzen-doubletree', lat: 52.185637864370754, lng: 21.142463683183966 },
  { slug: 'ferio-wawer', lat: 52.20643961512142, lng: 21.16806456403142 },
  // Dojazd do uzgodnienia
  { slug: 'bricoman-wilanow', lat: 52.15297185146504, lng: 21.093351761354374 },
  { slug: 'auchan-pulawska-427', lat: 52.141826658341266, lng: 21.02387121970856 },
  { slug: 'shell-galeria-mokotow', lat: 52.17777456510009, lng: 21.006682123623765 },
  { slug: 'cynamonowa-4', lat: 52.1489457, lng: 21.055811 },
  { slug: 'lopuszanska-22', lat: 52.19257846238642, lng: 20.95163280598338 },
  { slug: 'niepodleglosci-213', lat: 52.21431110095896, lng: 21.005091288313384 },
];

const WYJSCIE = join('static', 'img', 'mapy');
const CACHE = join(tmpdir(), 'jd-kafelki-osm');
const USER_AGENT = 'jazdy-doszkalajace static map build (https://jazdy-doszkalajace.pages.dev)';

mkdirSync(WYJSCIE, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

/** Współrzędne geograficzne -> pozycja w siatce kafelków (odwzorowanie Web Mercator). */
function doKafla(lat, lng) {
  const n = 2 ** ZOOM;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

async function pobierzKafel(x, y) {
  const plik = join(CACHE, `${ZOOM}-${x}-${y}.png`);
  if (existsSync(plik)) return plik;
  const r = await fetch(`https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!r.ok) throw new Error(`Kafel ${ZOOM}/${x}/${y}: HTTP ${r.status}`);
  writeFileSync(plik, Buffer.from(await r.arrayBuffer()));
  await czekaj(300); // grzecznie wobec serwerów OSM
  return plik;
}

for (const m of MIEJSCA) {
  const { x, y } = doKafla(m.lat, m.lng);
  const kx = Math.floor(x);
  const ky = Math.floor(y);

  // Siatka 3x3 kafli wokół punktu; punkt leży w środkowym kaflu
  const pliki = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      pliki.push(await pobierzKafel(kx + dx, ky + dy));
    }
  }

  // Pozycja punktu w sklejonym obrazku 768x768 i wycinek wycentrowany na nim
  const px = (x - kx) * KAFEL + KAFEL;
  const py = (y - ky) * KAFEL + KAFEL;
  const cropX = Math.round(px - SZER / 2);
  const cropY = Math.round(py - WYS / 2);

  const wejscia = pliki.flatMap((p) => ['-i', p]);
  const formaty = pliki.map((_, i) => `[${i}]format=rgb24[k${i}]`).join(';');
  const uklad = [0, 1, 2]
    .flatMap((r) => [0, 1, 2].map((c) => `${c * KAFEL}_${r * KAFEL}`))
    .join('|');
  const filtr =
    `${formaty};` +
    `${pliki.map((_, i) => `[k${i}]`).join('')}xstack=inputs=9:layout=${uklad},` +
    `crop=${SZER}:${WYS}:${cropX}:${cropY}`;

  const cel = join(WYJSCIE, `${m.slug}.webp`);
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', ...wejscia, '-filter_complex', filtr, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', cel],
    { stdio: 'inherit' }
  );
  console.log(`OK  ${cel}  (punkt w siatce: ${px.toFixed(1)}, ${py.toFixed(1)})`);
}
