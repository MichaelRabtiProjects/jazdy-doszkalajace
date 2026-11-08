"""Mapa przeglądowa WSZYSTKICH miejsc spotkań (sekcja Kontakt na stronie)
oraz plik KML do zaimportowania w Moich Mapach Google.

Co powstaje (dwa kadry tej samej okolicy):
  static/img/mapy/mapa-miejsc-spotkan-warszawa.webp          (16:9, desktop)
  static/img/mapy/mapa-miejsc-spotkan-warszawa-900.webp      (16:9, mniejsza)
  static/img/mapy/mapa-miejsc-spotkan-warszawa-telefon.webp  (1:1, ciaśniej —
      na telefonie pinezki są dalej od siebie)
  marka/mapa-miejsc-spotkan.kml                               (do Moich Map Google)
oraz na wyjściu: pozycje pinezek w % dla obu kadrów (do index.html:
--x/--y = desktop, --xm/--ym = telefon).

Dlaczego statyczny obrazek, a nie od razu osadzona mapa Google:
osadzona mapa ładuje skrypty i cookies Google u KAŻDEGO odwiedzającego,
a Polityka prywatności obiecuje brak trackerów. Ten obrazek leży na naszym
serwerze; interaktywna mapa Google ładuje się dopiero po kliknięciu
„Przybliż na mapie Google” (js/main.js, blok „Mapa miejsc spotkań”).
Pinezki NIE są wtopione w obrazek — rysuje je HTML/CSS w pozycjach z tego
skryptu, więc podpisy da się tłumaczyć i klikać.

Źródło: Esri World Imagery + warstwy opisów Esri (drogi, nazwy dzielnic).
Licencja wymaga podpisu przy mapie — jest pod mapą w index.html.
UWAGA: Esri numeruje kafelki z/y/x (nie z/x/y jak OpenStreetMap).

Uruchomienie (z katalogu projektu):  python narzedzia/generuj-mape-miejsc.py
Wymaga: Python 3 + Pillow. Kafelki trzyma w katalogu tymczasowym —
ponowne uruchomienie nic nie pobiera.

Nowe miejsce: dopisz je do MIEJSCA, uruchom skrypt, przepisz pozycje
pinezek do index.html i zaimportuj nowy KML w Moich Mapach Google.
"""
import json
import math
import os
import tempfile
import time
import urllib.request
from io import BytesIO
from xml.sax.saxutils import escape

from PIL import Image

ZOOM = 13
KAFEL = 256
# Kadry: (dopisek w nazwie pliku, zapas po bokach skrajnych pinezek w px, proporcje, szerokości plików)
KADRY = [
    ('', 190, 16 / 9, [None, 900]),       # None = pełna szerokość wycinka
    ('-telefon', 60, 1, [1100]),          # kwadrat: nad i pod pinezkami jest miejsce na dymek
]

# typ: 'gratis' = dojazd bezpłatny (160 zł/h), 'uzgodnienie' = 175 zł/h.
# Te same miejsca (i współrzędne) są w lib/miejsca.js — grafik rezerwacji.
MIEJSCA = [
    ('bedzinska-km-park', 'Będzińska / K&M Park', 52.18149683839272, 21.190286834215232, 'gratis'),
    ('zerzen-doubletree', 'Zerzeń / DoubleTree by Hilton', 52.185637864370754, 21.142463683183966, 'gratis'),
    ('ferio-wawer', 'Ferio Wawer', 52.20643961512142, 21.16806456403142, 'gratis'),
    ('bricoman-wilanow', 'Bricoman Warszawa Wilanów', 52.15297185146504, 21.093351761354374, 'uzgodnienie'),
    ('auchan-pulawska-427', 'Auchan Puławska 427', 52.141826658341266, 21.02387121970856, 'uzgodnienie'),
    ('shell-galeria-mokotow', 'Stacja Shell koło Galerii Mokotów', 52.17777456510009, 21.006682123623765, 'uzgodnienie'),
    ('cynamonowa-4', 'Parking Cynamonowa 4 (koło dealera Mazdy)', 52.1489457, 21.055811, 'uzgodnienie'),
    ('lopuszanska-22', 'Łopuszańska 22', 52.19257846238642, 20.95163280598338, 'uzgodnienie'),
    ('niepodleglosci-213', 'al. Niepodległości 213 — parking pod Biblioteką Narodową', 52.21431110095896, 21.005091288313384, 'uzgodnienie'),
    ('hangar-646', 'Wał Miedzeszyński 646 (obok Hangar 646)', 52.2220217, 21.0827851, 'uzgodnienie'),
]

WARSTWY = [
    'World_Imagery',
    'Reference/World_Transportation',
    'Reference/World_Boundaries_and_Places',
]
CACHE = os.path.join(tempfile.gettempdir(), 'jd-kafelki-esri-przeglad')
USER_AGENT = 'jazdy-doszkalajace static map build (https://lajtelka.pl)'


def piksel(lat, lng):
    """Współrzędne -> piksel w globalnej siatce Web Mercator na poziomie ZOOM."""
    n = KAFEL * 2 ** ZOOM
    rad = math.radians(lat)
    x = (lng + 180) / 360 * n
    y = (1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2 * n
    return x, y


def kafel(warstwa, x, y):
    plik = os.path.join(CACHE, warstwa.replace('/', '_') + f'-{ZOOM}-{x}-{y}.png')
    if not os.path.exists(plik):
        url = f'https://server.arcgisonline.com/ArcGIS/rest/services/{warstwa}/MapServer/tile/{ZOOM}/{y}/{x}'
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            dane = r.read()
        with open(plik, 'wb') as f:
            f.write(dane)
        time.sleep(0.25)  # grzecznie wobec serwera kafelków
    return Image.open(plik).convert('RGBA')


def main():
    os.makedirs(CACHE, exist_ok=True)
    punkty = [piksel(lat, lng) for _, _, lat, lng, _ in MIEJSCA]
    xs = [p[0] for p in punkty]
    ys = [p[1] for p in punkty]

    for dopisek, margines, proporcje, szerokosci in KADRY:
        # Wycinek: wszystkie pinezki + margines, zadane proporcje wokół środka
        szer = round(max(xs) - min(xs) + 2 * margines)
        wys = round(szer / proporcje)
        sx = (max(xs) + min(xs)) / 2
        sy = (max(ys) + min(ys)) / 2
        x0 = round(sx - szer / 2)
        y0 = round(sy - wys / 2)

        kx0, ky0 = x0 // KAFEL, y0 // KAFEL
        kx1, ky1 = (x0 + szer - 1) // KAFEL, (y0 + wys - 1) // KAFEL
        plotno = Image.new('RGBA', ((kx1 - kx0 + 1) * KAFEL, (ky1 - ky0 + 1) * KAFEL))
        for warstwa in WARSTWY:
            for ky in range(ky0, ky1 + 1):
                for kx in range(kx0, kx1 + 1):
                    plotno.alpha_composite(kafel(warstwa, kx, ky), ((kx - kx0) * KAFEL, (ky - ky0) * KAFEL))
        obraz = plotno.crop((x0 - kx0 * KAFEL, y0 - ky0 * KAFEL,
                             x0 - kx0 * KAFEL + szer, y0 - ky0 * KAFEL + wys)).convert('RGB')

        wyj = os.path.join('static', 'img', 'mapy')
        os.makedirs(wyj, exist_ok=True)
        for w in szerokosci:
            nazwa = f'mapa-miejsc-spotkan-warszawa{dopisek}' + (f'-{w}' if w and dopisek == '' else '') + '.webp'
            plik = os.path.join(wyj, nazwa)
            (obraz if not w else obraz.resize((w, round(w * wys / szer)), Image.LANCZOS)).save(
                plik, 'WEBP', quality=76, method=6)
            print('OK', plik, Image.open(plik).size, os.path.getsize(plik) // 1024, 'KB')

        pozycje = {}
        for (slug, *_), (x, y) in zip(MIEJSCA, punkty):
            pozycje[slug] = (round((x - x0) / szer * 100, 2), round((y - y0) / wys * 100, 2))
        print('Pozycje pinezek', dopisek or '(desktop)', json.dumps(pozycje, ensure_ascii=False))

    # KML do Moich Map Google (Importuj -> ten plik). Kolory w KML: aabbggrr.
    style = {
        'gratis': ('ff589d0f', '160 zł/h — dojazd bezpłatny, niezależnie od dnia tygodnia'),
        'uzgodnienie': ('ff007cf5', '175 zł/h (dopłata 15 zł/h za dojazd) — do uzgodnienia: WhatsApp, SMS bądź telefon 690 360 164. Gdy tego dnia i tak jestem w pobliżu — 160 zł/h.'),
    }
    cena = {'gratis': '160 zł/h', 'uzgodnienie': '175 zł/h'}
    znaczniki = []
    for slug, nazwa, lat, lng, typ in MIEJSCA:
        trasa = f'https://www.google.com/maps/dir/?api=1&destination={lat:.6f},{lng:.6f}&travelmode=transit'
        opis = (f'{style[typ][1]}\n\nDojazd komunikacją miejską: {trasa}\n\n'
                f'Wolne terminy i rezerwacja: https://lajtelka.pl/#grafik')
        znaczniki.append(
            f'    <Placemark>\n      <name>{escape(nazwa)} · {cena[typ]}</name>\n'
            f'      <description>{escape(opis)}</description>\n'
            f'      <styleUrl>#{typ}</styleUrl>\n'
            f'      <Point><coordinates>{lng:.6f},{lat:.6f},0</coordinates></Point>\n    </Placemark>')
    kml = ('<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n'
           '    <name>LajtELka — miejsca spotkań</name>\n' +
           ''.join(f'    <Style id="{t}"><IconStyle><color>{c}</color><scale>1</scale><Icon>'
                   '<href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href>'
                   '</Icon></IconStyle></Style>\n' for t, (c, _) in style.items()) +
           '\n'.join(znaczniki) + '\n  </Document>\n</kml>\n')
    os.makedirs('marka', exist_ok=True)
    with open(os.path.join('marka', 'mapa-miejsc-spotkan.kml'), 'w', encoding='utf-8') as f:
        f.write(kml)
    print('OK marka/mapa-miejsc-spotkan.kml')


if __name__ == '__main__':
    main()
