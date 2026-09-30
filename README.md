# Obzor

Osobná appka: novinky dňa vybrané podľa tvojich záujmov, počasie pre vybrané miesta,
meniny (SK) a svátky (CZ) a narodeniny blízkych.
Funguje v mobile (iPhone aj Android) aj na počítači a dá sa nainštalovať na plochu ako bežná appka.

## Čo vie

- **Úvodná obrazovka (4 s)** pri každom otvorení: dátum, deň, rok, kto má meniny na Slovensku a svátek v Česku,
  štátne sviatky, narodeniny a meniny ľudí z tvojho zoznamu. Ťuknutím sa dá preskočiť.
  Ukáže sa aj vtedy, keď sa do appky vrátiš po viac ako 10 minútach.
- **Novinky**: po úvodnej obrazovke príde balíček správ z okruhov, ktoré si vyberieš
  (technológie, vojna, ekonomika, politika…). Karta ukazuje titulok a stručné zhrnutie,
  ťuknutím otvoríš detail a odkaz na celý článok. Swipe **doprava** = páči sa mi,
  **doľava** = nezaujíma ma, **dole** = neutrálne. Počet správ po spustení sa nastavuje
  v Nastaveniach (predvolene 5), ďalšie sú na domovskej obrazovke a v záložke Novinky.
  Z hodnotení sa appka učí, ktoré okruhy, médiá, typ článkov (krátke správy, analýzy…)
  a mená či miesta ťa zaujímajú, a podľa toho vyberá správy na ďalšie dni.
- **Počasie**: ľubovoľný počet miest (vyhľadávanie aj „moja poloha“), prepínanie potiahnutím prstom.
  Aktuálna teplota, hodinová predpoveď na 24 h s východom a západom slnka, predpoveď na 10 dní,
  oblačnosť (graf na 24 h + nízka / stredná / vysoká), pocitová teplota, vietor, UV index,
  zrážky, vlhkosť, viditeľnosť, tlak, kvalita ovzdušia a fáza Mesiaca.
  Dáta sú z [Open-Meteo](https://open-meteo.com/) (zadarmo, bez registrácie).
- **Narodeniny**: pridávanie, úprava, mazanie; odpočet dní, vek, a kedy má človek meniny/svátek.
- **Kalendár**: listovanie po dňoch, vyhľadanie „kedy má meniny…“, prehľad najbližších 14 dní.
- **Nastavenia**: okruhy noviniek, ich počet, jazyk zdrojov, čo sa appka naučila, stav zdrojov a záloha.

## Ako fungujú novinky

1. Automatická úloha na GitHube (`.github/workflows/news.yml`) každých 30 minút spustí
   `scripts/fetch-news.mjs`. Ten stiahne RSS kanály zo `scripts/feeds.json` (SME, Denník N,
   Aktuality, TASR, iROZHLAS, ČT24, BBC, Guardian… spolu okolo 50), roztriedi správy do okruhov,
   spojí rovnakú udalosť z viacerých médií a výsledok uloží ako `news.json` do vetvy `news`.
2. Appka si `news.json` stiahne, z nových správ v tvojich okruhoch vyberie tie najlepšie
   (podľa toho, čo sa naučila, koľko médií o udalosti píše a ako je správa čerstvá) a ukáže ich ako karty.
3. Učenie prebieha priamo v zariadení (malý model, ktorý sa po každom swipe upraví). Nič sa nikam neposiela.

Pridať alebo odobrať zdroj: uprav `scripts/feeds.json`. Ktoré zdroje fungujú, vidíš v appke v **Nastavenia → Zdroje správ**.

## Ako ju spustiť

Appka je obyčajná webová stránka (`index.html` + pár pomocných súborov). Stačí ju dať na internet:

**Najrýchlejšie – Netlify Drop (na počítači):**
1. Otvor <https://app.netlify.com/drop> a zaregistruj sa (zadarmo).
2. Pretiahni tam celý priečinok `obzor` (alebo rozbalený ZIP).
3. Dostaneš adresu typu `https://nieco.netlify.app` – tú otvor v mobile.

**Alternatíva – GitHub Pages:** nahraj súbory do repozitára a v *Settings → Pages* zapni publikovanie z vetvy `main`.

**Inštalácia na plochu mobilu:**
- iPhone (Safari): tlačidlo Zdieľať → *Pridať na plochu*.
- Android (Chrome): menu ⋮ → *Inštalovať aplikáciu* / *Pridať na plochu*.

Na počítači sa dá `index.html` otvoriť aj priamo dvojklikom (počasie funguje, inštalácia nie).

## Kde sú moje dáta

Miesta, narodeniny a naučené preferencie noviniek sa ukladajú iba v prehliadači daného zariadenia.
V záložke **Nastavenia → Záloha** si ich stiahneš do súboru a v inom zariadení obnovíš.

## Štruktúra (pre ďalšie rozširovanie)

- `index.html` – celá appka: štýly, dáta menín a sviatkov, logika. Časti sú oddelené komentármi
  (`Kalendár`, `Počasie`, `Narodeniny`, `Novinky`, `Úvodná obrazovka`, `Aplikácia – záložky`).
- `scripts/fetch-news.mjs`, `scripts/feeds.json`, `.github/workflows/news.yml` – zber noviniek.
- Nová funkcia = nová `<section id="view-…">`, nové tlačidlo v `.tabbar` a názov v `App.tabs`.
- `manifest.webmanifest`, `sw.js`, `icons/` – inštalácia na plochu a spustenie bez internetu.
- Kalendár menín je v poliach `MENINY_SK` a `SVATKY_CZ` (jeden riadok = jeden mesiac), dá sa ručne opraviť.
