/* Tłumaczenia strony głównej (index.html) na angielski.
   Polski jest już w HTML-u — ten plik dopisuje tylko wersję angielską,
   pod kluczami z atrybutów data-i18n / data-i18n-attr.
   Sekcja Khaled (#khaled) jest z założenia zawsze po angielsku — nie ma
   tu dla niej wpisów, bo nie ma czego tłumaczyć. */
window.I18N = {
  /* --- Nawigacja --- */
  'nav-oferta': 'Offer',
  'nav-grafik': 'Schedule',
  'nav-omnie': 'About me',
  'nav-cennik': 'Pricing',
  'nav-opinie': 'Reviews',
  'nav-galeria': 'Gallery',
  'nav-kontakt': 'Contact',
  'nav-toggle-label': 'Open menu',

  /* --- Hero --- */
  'hero-kicker': 'Warsaw · Wawer and the surrounding area',
  'hero-h1': 'Get back behind the wheel with confidence — refresher driving lessons for licensed drivers',
  'hero-lead':
    'Brush up your skills after a break, prepare for your exam on the exact WORD routes, or book ' +
    'an individual lesson built around what you need.',
  'hero-cta': 'See available times',

  /* --- Oferta / Offer --- */
  'oferta-kicker': 'Refresher lessons',
  'oferta-title': 'Offer',
  'oferta-lead': 'Three ways to feel confident on the road.',
  'oferta-1-h': 'Back behind the wheel',
  'oferta-1-p':
    'For people who already hold a licence but haven’t driven in a long time. A calm pace, ' +
    'getting used to the car, city traffic and current rules again — no stress, no judgement.',
  'oferta-2-h': 'WORD exam preparation',
  'oferta-2-p':
    'Driving the actual exam routes, so exam day isn’t the first time you see them.',
  'oferta-2-badges-label': 'WORD exam routes',
  'oferta-3-h': 'Individual lessons',
  'oferta-3-p':
    'Parallel and perpendicular parking, fast-traffic roads, night driving, difficult conditions — ' +
    'a programme built around whatever you need right now.',
  /* Własna, początkująca oferta Michaela po angielsku — celowo osobny
     zestaw kluczy od oferta-alp-* (Khaled) tuż niżej. Nie łączyć treści.
     UWAGA: link do #khaled jest wpisany na sztywno w tej wartości (nie
     jako osobny data-i18n na <a> w HTML-u) — data-i18n na elemencie
     zagnieżdżonym w innym data-i18n nigdy się nie wykona, bo rodzic
     i tak nadpisuje cały swój innerHTML. Ta sama zasada co w polityce
     prywatności (patrz i18n-data-polityka.js, punkt p4). */
  'oferta-en-note':
    'I also run refresher driving lessons in English, at the same price as in Polish. This is my ' +
    'start in teaching in a foreign language, so I treat it as a shared experience — if you’re ' +
    'looking for someone with years of practice in English, also check out ' +
    '<a href="#khaled">Instructor Khaled’s offer</a>.',
  'oferta-alp-note':
    'Lessons are also available in English and Arabic — taught by instructor Khaled as part of ALP.',
  'oferta-alp-btn': 'See the ALP offer ↓',

  /* --- Grafik / Schedule --- */
  'grafik-kicker': 'Available slots',
  'grafik-title': 'Schedule',
  'grafik-lead': 'Available times for the coming weeks. Pick a lesson length, then click the time that suits you.',
  'grafik-umow-note':
    'We usually meet around Wawer, but if the commute doesn’t suit you, just message me and we’ll ' +
    'agree on another spot. Message or call to arrange a time and details – the longer you put it off, ' +
    'the longer the stress waits for „someday” :P',
  'grafik-dlugosc-label': 'Lesson length',
  'grafik-wczytywanie': 'Loading available times…',
  'dni-lewo-label': 'Earlier days',
  'dni-pasek-label': 'Choose a day',
  'dni-prawo-label': 'Later days',
  'grafik-call-btn': 'Call: 690 360 164',
  'grafik-email-btn': 'Send an e-mail',
  'dlugosc-2h': '2 hours',
  'dlugosc-3h': '3 hours',
  'dlugosc-4h': '4 hours',

  /* --- O mnie / About me --- */
  'omnie-kicker': 'Category B instructor',
  'omnie-title': 'About me',
  'omnie-intro-1':
    'Hi, I’m Michael. I’ve been driving since I was 18 – my father was also a driving instructor, ' +
    'so in a way I grew up „behind the wheel”. Before becoming an instructor I built up broad experience ' +
    'driving all kinds of vehicles: taxis, box vans, refuse trucks, gritter-snowplows, street sweepers, ' +
    'excavator-loaders, and category C+E trucks – rigid trucks with drawbar trailers and articulated ' +
    'combinations. Since 2026 I’ve also added motorcycle riding to my licences and experience.',
  'omnie-intro-2':
    'I’ve been working as a category B driving instructor for almost two years. I know the exam ' +
    'routes at Odlewnicza, Bemowo and Grójec very well, and I’m currently getting to know the ' +
    'Garwolin routes as I go.',
  'omnie-b1-h': 'I teach so you understand the rules, not just repeat them',
  'omnie-b1-p':
    'I try to explain all the rules and exam techniques exactly as they’re written in the actual laws ' +
    'and their annexes, so you understand not just how to pass the exam, but precisely what the examiner ' +
    'is looking at when assessing your driving – so you know exactly what the exam rules are, what earns ' +
    'a pass, what counts as a minor fault, and what causes an instant fail. I like this angle, because it ' +
    'teaches you a bit from the examiner’s side rather than just as a candidate – you know your rights ' +
    'during the exam.',
  'omnie-b2-h': 'Exam routes',
  'omnie-b2-p':
    'I know the exam routes very well, especially at Odlewnicza – students sometimes take their actual ' +
    'exam on the exact route we practised, doing the manoeuvres in the exact same spots. Then Bemowo and ' +
    'Grójec, and finally Garwolin – the one I’ve had the least chance to drive so far.',
  'omnie-routes-label': 'Familiarity with exam routes',
  'omnie-route-1': 'know best',
  'omnie-route-2': 'know very well',
  'omnie-route-3': 'know well',
  'omnie-route-4': 'still getting to know',
  'omnie-b3-h': 'Coming back to driving after a break?',
  'omnie-b3-p':
    'If you already hold a licence but haven’t sat behind the wheel in a while – you don’t need an exam ' +
    'on the horizon to practise with me. Many of my students come back to driving after years away – after ' +
    'having a child, moving city, or simply not having had the opportunity – and start out feeling unsure ' +
    'or stressed at the very thought of heading out onto the street. Together we rebuild your confidence at ' +
    'your own pace: from quiet residential streets, through parking and manoeuvres, up to busier traffic if ' +
    'that’s what you need. No judgement, no rush – just real practice to help you feel at ease behind the ' +
    'wheel again.',
  'omnie-b4-h': 'Atmosphere during lessons',
  'omnie-b4-p':
    'With me, lessons run in a friendly, relaxed atmosphere, while staying professional about the actual ' +
    'teaching. I don’t like rudeness, so I’m not artificially nice either – I try to just be myself. ' +
    'I have experience working at Babska Autoszkoła with all kinds of students – the vast majority were ' +
    'happy with how I taught them. I try to keep things friendly, because we do spend a good few hours – ' +
    'sometimes dozens of them – behind the wheel together, talking about more than just driving – for some ' +
    'people it even turns into a bit of therapy, once they trust me enough to open up.',
  /* Własna, początkująca oferta Michaela po angielsku — patrz uwaga przy
     oferta-en-note wyżej (osobne od sekcji Khaleda). */
  'omnie-en-h': 'I also teach in English',
  'omnie-en-p':
    'I’ve recently started running refresher lessons in English too. I’m right at the beginning ' +
    'of this, so don’t expect perfect fluency from me — I see it as a shared experience with the ' +
    'student. If you’d like to practise the language along the way, with no pressure and no ' +
    'judgement, you’re welcome to book.',
  'omnie-reviews-link': 'See student reviews ↓',
  'omnie-closing':
    'Best wishes to all my students – those who’ve already passed, those still preparing for their exam, ' +
    'and those who simply came to brush up their skills. I hope you all have a long, safe road ahead.',

  /* --- Cennik / Pricing --- */
  'cennik-kicker': 'Clear pricing',
  'cennik-title': 'Pricing',
  'cennik-lead': 'One hourly rate, no hidden costs.',
  'cennik-za-godzine': 'per hour',
  'cennik-pakiet-badge': 'Package',
  'cennik-pakiet-godzin': '10 hours',
  'cennik-pakiet-note': '150 zł/h — 10 zł cheaper per hour',
  /* [KWOTA] — ten sam placeholder co w index.html; wpisując kwotę,
     podmienić w obu miejscach. */
  'cennik-stali':
    'Regular students pay less — [KWOTA] zł/h below the prices above. Details once we’re working together regularly.',
  'cennik-en':
    'Same prices in English (this applies to lessons with me — for lessons with Instructor Khaled ' +
    'in English/Arabic, pricing is individual, see his section).',
  'cennik-note':
    'A single lesson is 2 to 4 hours — the 10-hour package is split across several sessions, arranged ' +
    'when you get in touch.',

  /* --- Opinie / Reviews --- */
  'opinie-kicker': 'Google reviews',
  'opinie-title': 'Reviews',
  'opinie-lead': 'Real student reviews — straight from the Google listing and messages after passed exams.',
  'opinie-w-google': 'on Google',
  'opinie-filtruj-label': 'Filter reviews',
  'opinie-filtr-wszystkie': 'All',
  'opinie-jezyk-nota':
    'The reviews below are screenshots, shown exactly as they were left — most are in Polish, since that’s ' +
    'the language most students write in. A few are already in English or Arabic.',

  /* Zdjęcia opinii — same rzrzuty ekranu zostają po polsku (screenshots),
     tłumaczymy tylko opis (alt/caption). Numery 11-13 są już po angielsku
     w treści zrzutu, więc świadomie nie mają tu wpisu (patrz index.html). */
  'rev-g01': 'Google review from student Kinga — 5 stars for exam preparation and confidence behind the wheel',
  'rev-g02': 'Google review from student Robert — 5 stars for professionalism and attitude towards the student',
  'rev-g03': 'Google review from Andrzej — back to driving after an 8-year break, passed the exam on the first try',
  'rev-g04': 'Google review from Robert — passed the exam after three refresher lessons',
  'rev-g05': 'Google review — passed the exam without a single fault',
  'rev-g06': 'Google review from Paweł — a demanding but patient instructor',
  'rev-g07': 'Google review from Weronika — refresher lessons after a long break from driving',
  'rev-g08': 'Google review — best instructor, 5-star rating',
  'rev-g09': 'Google review — passed the exam after previous unsuccessful attempts',
  'rev-g10': 'Google review from Zosia — passed the exam flawlessly',
  'rev-g14': 'Google review in Arabic — driving lessons with an Arabic-speaking instructor',
  'rev-g15': 'Google review in Arabic — professional approach and stress-free learning',
  'rev-m01': 'Message from a student — passed the exam in Garwolin on the first try',
  'rev-m02': 'Message from student Maja — passed exam, exam sheet',
  'rev-m03': 'Message from student Jan — passed the practical exam',
  'rev-m04': 'Message from a student — passed the exam at Odlewnicza',
  'rev-m05': 'Message from student Oliwia — passed the exam almost flawlessly',
  'rev-m06': 'Message from student Andrzej — passed the practical exam',
  'rev-m07': 'Message from a student — passed the exam through sheer persistence',
  'rev-m08': 'Message from student Sylwia — passed on the first attempt at Odlewnicza',
  'rev-m09': 'Message from student Julia — passed the exam',
  'rev-m10': 'Message from student Marta — passed the exam with one fault',
  'rev-m11': 'Message from student Antoni — words of praise from the examiner for the instructor',
  'rev-m12': 'Message from a student — passed on the first try, no stress during the exam',
  'rev-m13': 'Message from student Konrad — the examiner praised his good preparation',
  'rev-m14': 'Message from student Paweł — passed the exam on the first try',
  'rev-m15': 'Message from student Bartek — passed the exam in pouring rain',
  'rev-m16': 'Student review from the time the instructor worked at Babska Autoszkoła',

  /* --- Galeria / Gallery --- */
  'galeria-kicker': 'Photos & videos',
  'galeria-title': 'Gallery',
  'galeria-lead': 'Students who agreed to have their photo published, plus footage from the manoeuvring yard.',

  'gal-v1': 'Practising driving around a curve on the manoeuvring yard',
  'gal-v1-alt': 'Practising driving around a curve on the manoeuvring yard — video',
  'gal-v2': 'Manoeuvring exercises during a refresher driving lesson',
  'gal-v2-alt': 'Manoeuvring exercises during a refresher driving lesson — video',
  'gal-v3': 'A student’s review of refresher driving lessons in Warsaw',
  'gal-v3-alt': 'A driving-school car with a lit-up L-plate in the evening — video with a student review',

  'gal-01': 'Instructor with a student during a category B refresher driving lesson in Warsaw',
  'gal-02': 'A happy student after a refresher driving lesson in Warsaw’s Wawer district',
  'gal-03': 'Passed driving exam on the WORD Odlewnicza route',
  'gal-04': 'Passed driving exam on the WORD Bemowo route',
  'gal-05': 'Instructor and student after a successful refresher driving lesson',
  'gal-06': 'Happy students of the driving school in Warsaw’s Wawer district',
  'gal-07': 'Driving instructor in Warsaw with a student',
  'gal-08': 'Refresher driving lesson ahead of a driving exam in Warsaw',
  'gal-09': 'Stress-free driving lessons with an instructor in Warsaw',
  'gal-10': 'Student with a passed category B exam sheet',
  'gal-11': 'Refresher lessons after years away from driving, in Warsaw',
  'gal-12': 'Refresher driving instructor by the car in Warsaw',
  'gal-13': 'Practice run ahead of the WORD exam',
  'gal-14': 'Category B refresher driving lessons in Warsaw',
  'gal-15': 'Car used for refresher driving lessons in Warsaw',
  'gal-16': 'Exam preparation on the WORD Bemowo route',
  'gal-17': 'Exam preparation on the WORD Odlewnicza route in Warsaw',
  'gal-18': 'Interior of the refresher-lesson driving car in Warsaw',
  'gal-19': 'Happy students of refresher driving lessons in Warsaw',
  'gal-20': 'Refresher driving lessons for women in Warsaw',
  'gal-20-alt': 'Student with the instructor in the car during a refresher driving lesson in Warsaw',
  'gal-21': 'Instructor and student during a refresher driving lesson in Warsaw',
  'gal-21-alt': 'Instructor and student in the car during a refresher driving lesson in Warsaw',
  'gal-22': 'A happy student after a refresher driving lesson in Warsaw',
  'gal-22-alt': 'Student giving a thumbs up after a refresher driving lesson in Warsaw',

  /* --- Kontakt / Contact --- */
  'kontakt-kicker': 'Book a lesson',
  'kontakt-title': 'Contact',
  'kontakt-instruktor-label': 'Instructor:',
  'kontakt-telefon-label': 'Phone:',
  'kontakt-obszar-label': 'Service area:',
  'kontakt-obszar-tekst': 'Wawer and the surrounding Warsaw area — other districts by arrangement.',

  /* --- Miejsca spotkań / Meeting points --- */
  'miejsca-1-tytul':
    'Main meeting points — free of charge, any day of the week. Another spot can be arranged by phone.',
  'miejsca-1-label': 'Main meeting points',
  'miejsca-2-tytul':
    'Additional spots — I sometimes come here at no extra cost if I happen to be in the area, but this ' +
    'needs to be agreed in advance — WhatsApp, SMS or a phone call.',
  'miejsca-2-label': 'Additional spots',
  'miejsca-2-nota':
    'The first lesson booked in advance at one of these spots carries a surcharge of 15 zł per hour — ' +
    'I have to drive over from Wawer and back again afterwards. For further lessons at the same spot, the ' +
    'price is agreed individually.',
  'slajder-prev': 'Previous spots',
  'slajder-next': 'Next spots',
  'miejsce-status-bezplatne': 'Free of charge',
  'miejsce-status-warunkowe': 'To be agreed by phone',
  'miejsce-otworz': 'Open in Google Maps',
  'mapy-atrybucja': 'Satellite imagery:',
  'mapy-osm': 'Esri, Maxar, Earthstar Geographics',
  // Nazwy własne zostają jak są; tłumaczymy tylko opisowe dopiski
  'm1-1': 'Będzińska / K&amp;M Park',
  'm1-2': 'Zerzeń / DoubleTree by Hilton',
  'm1-3': 'Ferio Wawer',
  'm2-1': 'Bricoman Warszawa Wilanów',
  'm2-2': 'Auchan Puławska 427',
  'm2-3': 'Shell station near Galeria Mokotów',
  'm2-4': 'Car park at Cynamonowa 4 (by the Mazda dealer)',
  'm2-5': 'Łopuszańska 22',
  'm2-6': 'al. Niepodległości 213 — car park by the National Library',

  /* --- Stopka / Footer --- */
  'footer-prawa': '© 2026 Jazdy Doszkalające. All rights reserved.',
  'footer-regulamin': 'Terms of Service',
  'footer-polityka': 'Privacy Policy',
  'footer-area': 'Refresher driving lessons Warsaw · Wawer',

  /* --- Pływający przycisk / Floating button --- */
  'fab-label': 'Call the instructor: 690 360 164',
  'fab-text': 'Call',
  'whatsapp-fab-label': 'Message the instructor on WhatsApp',
  'whatsapp-fab-text': 'Message',
  'messenger-fab-label': 'Message the instructor on Messenger',
  'messenger-fab-text': 'Message',

  /* --- Panel terminu / lightbox --- */
  'zamknij-label': 'Close',
  'lightbox-label': 'Preview',
  'lightbox-close-label': 'Close preview',
  'lightbox-prev-label': 'Previous',
  'lightbox-next-label': 'Next',
};
