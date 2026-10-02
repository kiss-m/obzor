# Obzor – gamifikácia: Postava, XP a levely

3. 10. 2026 · @Matej

## Prehľad

Splnené úlohy a aktivity dávajú XP, z ktorého rastie tvoja postava: celkový level s titulom a samostatné levely štyroch atribútov (Telo, Myseľ, Práca, Vzťahy). Celkový level ukazuje, kam sa posúvaš, a atribúty prezrádzajú, čo zanedbávaš.

Zásady návrhu:

- **Odmeňovať úsilie, nie klikanie.** XP závisí od náročnosti úlohy a opakovanie tej istej veci v jeden deň má klesajúci výnos.
- **Netrestať.** XP sa nikdy neodpočítava (okrem vrátenia omylom splnenej úlohy). Deň bez aktivity nestojí nič, postava v ten deň len nerastie.
- **Všetko sa dá prepočítať.** Zdrojom pravdy je denník splnení. Celkový level aj levely atribútov sa z neho iba počítajú, takže zmena pravidiel nepokazí históriu.
- **Lokálne a bez účtov**, rovnako ako zvyšok Obzoru: dáta v `localStorage`, súčasť existujúcej zálohy.

## Úlohy a aktivity

XP prichádza z troch druhov záznamov a každý má atribút a náročnosť. Novinky, počasie ani swipovanie XP nedávajú.

- **Jednorazová úloha** (to-do): názov, atribút, náročnosť, voliteľný termín a poznámka. Jednu úlohu denne môžeš označiť ako **hlavnú úlohu dňa**.
- **Návyk** (opakovaná aktivita): napr. gym alebo učenie jazyka. Opakovanie denne, vo vybrané dni alebo X× týždenne; v deň, keď je na rade, sa ukáže v dnešnom zozname.
- **Rýchly záznam**: spontánna aktivita mimo zoznamu („bol som behať“). Zapíšeš ju dvoma ťuknutiami: atribút a náročnosť.

Náročnosť sa vyberá pri vytvorení a určuje základné XP:

| Náročnosť | Orientačne | XP |
|---|---|---|
| Drobnosť | do 10 min | 5 |
| Ľahká | 15–30 min | 10 |
| Stredná | okolo 1 h | 25 |
| Ťažká | 2–3 h alebo nepríjemná vec | 60 |
| Epická | väčší míľnik (odovzdaná kapitola, dokončený projekt) | 150 |

Príklady: tréning v gyme = Telo, stredná (25 XP); kapitola semestrálnej práce = Myseľ, ťažká (60 XP); nová dávka pre Beast Jerki = Práca, stredná (25 XP); zavolať rodičom = Vzťahy, ľahká (10 XP).

Pri splnení sa XP zapíše do denníka s hodnotou platnou v tej chvíli. Neskoršia zmena náročnosti už získané XP nemení.

## Postava

Postava má celkový level zo všetkého XP a samostatný level pre každý atribút. Prvé levely prídu za pár dní, level 20 pri bežnom tempe asi za päť mesiacov.

### Atribúty

- **Telo**: gym, pohyb, spánok, varenie.
- **Myseľ**: škola, učenie, jazyky, čítanie.
- **Práca**: stáž, vlastný biznis, osobné projekty.
- **Vzťahy**: rodina, priatelia, ozvať sa niekomu.

Názvy, farby a ikony sa dajú upraviť v Nastaveniach a dá sa pridať piaty (napr. Domov pre upratovanie a vybavovanie). Viac ako šesť atribútov by už ubralo na prehľadnosti.

### Pravidlá XP

1. **Základ** podľa náročnosti (tabuľka vyššie).
2. **Hlavná úloha dňa** dostane +50 % (stredná 25 → 38 XP).
3. **Klesajúci výnos**: tá istá úloha, návyk alebo rýchly záznam s rovnakým názvom v jeden deň dá 100 %, druhý raz 50 %, potom 0 %.
4. **Strop drobností**: drobnosti a ľahké úlohy spolu dajú najviac 60 XP denne. Nad strop sa stále odpisujú ako splnené, len bez XP.
5. **Späť**: po odkliknutí sa na 6 s ukáže hláška s tlačidlom Späť. Aj neskôr sa dá záznam zmazať v histórii dňa a XP sa prepočíta.

### Levely

Postup z levelu L na L+1 stojí 100·L XP. Celkové XP potrebné na dosiahnutie levelu L:

```
XP(L) = 50 · L · (L − 1)
```

Pri tempe okolo 120 XP denne (napr. gym, dve stredné úlohy a pár drobností) to vychádza takto:

| Level | Titul | Celkové XP | Približne za |
|---|---|---|---|
| 1 | Nováčik | 0 | hneď |
| 5 | Učeň | 1 000 | 8 dní |
| 10 | Technik | 4 500 | 5 týždňov |
| 15 | Konštruktér | 10 500 | 3 mesiace |
| 20 | Inžinier | 19 000 | 5 mesiacov |
| 25 | Projektant *(doplnené)* | 30 000 | 8 mesiacov |
| 30 | Hlavný inžinier | 43 500 | 1 rok |
| 35 | Architekt *(doplnené)* | 59 500 | 1,4 roka |
| 40 | Hlavný architekt *(doplnené)* | 78 000 | 1,8 roka |
| 45 | Majster *(doplnené)* | 99 000 | 2,3 roka |
| 50 | Legenda | 122 500 | asi 3 roky |

**Levely atribútov** používajú polovičnú krivku, 25·L·(L−1), lebo XP sa delí medzi viac atribútov. Rastú tak o niečo pomalšie než celkový level.

### Karta postavy

- Celkový level, titul a pruh do ďalšieho levelu („320 / 1 100 XP“).
- Štyri pruhy atribútov s ich levelmi.
- **Rovnováha za 14 dní**: podiel XP podľa atribútov. Keď má niektorý menej ako 10 %, karta to jemne pripomenie, bez pokuty.
- **Rekordy**: najlepší deň, najlepší týždeň, počet splnených úloh.

## Obrazovky a spätná väzba

Pribudne jedna záložka Úlohy s dvoma časťami, Dnes a Postava. Na existujúcich obrazovkách sa postava objaví len ako malá karta alebo riadok.

### Záložka Úlohy → Dnes

- Hore pruh: level, XP do ďalšieho levelu a „dnes +85 XP“.
- Poradie: hlavná úloha dňa, návyky na dnes, úlohy po termíne a s dnešným termínom, potom ostatné. Splnené dnes sú zbalené na konci.
- Splnenie: zaškrtávacie políčko. Splnená úloha ostane na svojom mieste, len zošedne; opätovným ťuknutím sa vráti.
- Listovanie kartou dňa: ťah **doprava** = ďalší deň (zajtra, pozajtra…), ťah **doľava** = späť, z dneška na Postavu a štatistiky. Rovnako fungujú šípky ‹ › a klávesy ← →.
- Tlačidlo + otvorí výber: nová úloha, nový návyk alebo rýchly záznam.

### Záložka Úlohy → Postava

Karta postavy podľa časti Postava: level, titul, pruhy atribútov, rovnováha za 14 dní a rekordy. Pod ňou týždenný prehľad XP po dňoch.

### Existujúce obrazovky

- **Domov (Počasie)**: malá karta, podobná karte noviniek, s levelom, dnešným XP a hlavnou úlohou dňa s tlačidlom Splniť.
- **Úvodná obrazovka**: jeden riadok pod dátumom, napr. „Level 12 · Technik“, a hlavná úloha dňa, ak je nastavená.
- **Kalendár**: v detaile dňa história splnení s XP. Tu sa dajú aj zmazať omylom zapísané záznamy.

### Spätná väzba

- Po splnení existujúca hláška (toast) „+25 XP · Telo“ s tlačidlom Späť a plynulý posun pruhu XP.
- **Nový level**: krátka celoobrazovková chvíľa (asi 1,5 s, ťuknutím zmizne). Pri novom titule s jeho názvom.
- **Nový level atribútu**: len výraznejšia hláška, aby sa oslavy neopotrebovali.
- **Odomknutia pri tituloch** (každých 5 levelov): nová farebná téma appky alebo štýl karty postavy. Malá vec, ale dáva levelom zmysel.
- Vibrácia cez `navigator.vibrate` funguje len na Androide; iPhone v Safari ju nepodporuje. Pri `prefers-reduced-motion` bez animácií.

## Dátový model a záloha

Všetko je v jednom kľúči `obzor.game`, cez existujúci `store.get('game')` a `store.set('game', …)`. Ukladajú sa len úlohy, denník splnení a nastavenia; XP, levely a rekordy sa počítajú z denníka.

```json
{
  "v": 1,
  "dayStartHour": 4,
  "attrs": [
    { "id": "telo", "name": "Telo", "color": "#1e8a4c", "icon": "dumbbell" },
    { "id": "mysel", "name": "Myseľ", "color": "#1c6cc0", "icon": "book" }
  ],
  "tasks": [
    { "id": "t_k2f9", "kind": "todo", "title": "Kapitola 3", "attr": "mysel", "diff": 4,
      "due": "2026-10-08", "note": "", "created": "2026-10-03", "done": null },
    { "id": "h_8x1a", "kind": "habit", "title": "Gym", "attr": "telo", "diff": 3,
      "repeat": { "type": "weekdays", "days": [1, 3, 5] }, "created": "2026-10-03", "archived": false }
  ],
  "mainTask": { "2026-10-03": "t_k2f9" },
  "log": [
    { "id": "e_p0q2", "ts": "2026-10-03T18:20:00+02:00", "day": "2026-10-03",
      "ref": "h_8x1a", "title": "Gym", "attr": "telo", "diff": 3, "xp": 25 }
  ],
  "unlocked": ["tema-oranzova"]
}
```

- `diff` je poradie náročnosti 1–5 (drobnosť až epická).
- `repeat.type` opakovanej úlohy (návyku):
  - `daily` – každý deň,
  - `weekdays` s `days` – vybrané dni v týždni (1 = pondelok … 7 = nedeľa),
  - `perWeek` s `count` – X× týždenne, bez pevných dní: ukazuje sa každý deň, kým v týždni (po – ne) nie je splnená `count`-krát,
  - `interval` s `every` – každých N dní od dátumu `start`,
  - `monthly` s `day` – raz mesačne v daný deň (v kratšom mesiaci posledný deň).
- `start` – od ktorého dňa sa opakovaná úloha začína ukazovať (dá sa naplánovať do budúcnosti).
- **Denník (`log`) je zdroj pravdy.** Záznam si nesie finálne XP aj názov a atribút, takže história vydrží aj zmazanie úlohy. Rýchly záznam má `ref: null`.
- **Deň začína o 4:00** (`dayStartHour`), takže úloha splnená o jednej v noci patrí ešte k včerajšku. Platia podľa toho dnešné XP aj strop drobností.
- **Veľkosť**: približne 1 500 záznamov za rok, čo je asi 150 kB. Limit `localStorage` (okolo 5 MB) vydrží roky a prepočet pri štarte trvá milisekundy.

**Záloha**: `Backup.export()` dostane pole `game` a verziu 3. `Backup.import()` ho obnoví, ak v súbore je; staršie zálohy bez neho nechajú súčasné dáta postavy bez zmeny. Postava je, ako všetko v Obzore, len v jednom zariadení; prenos medzi mobilom a počítačom ide cez zálohu.

## Parametre na ladenie

Všetky čísla sú v jednom objekte konštánt `GAME` na začiatku sekcie, takže ladenie je zmena na jednom mieste.

| Parameter | Predvolená hodnota | Konštanta |
|---|---|---|
| XP podľa náročnosti | 5 / 10 / 25 / 60 / 150 | `XP_BY_DIFF` |
| Bonus hlavnej úlohy dňa | +50 % | `MAIN_BONUS` |
| Klesajúci výnos pri opakovaní v jeden deň | 100 % / 50 % / 0 % | `REPEAT_FACTORS` |
| Strop drobností a ľahkých úloh | 60 XP za deň | `SMALL_CAP` |
| Krivka celkového levelu | 100·L XP na postup | `LEVEL_STEP` |
| Krivka levelu atribútu | 50·L XP na postup | `ATTR_STEP` |
| Nový titul a odomknutie | každých 5 levelov | `TITLE_EVERY` |
| Upozornenie na nerovnováhu | atribút pod 10 % za 14 dní | `BALANCE_MIN`, `BALANCE_DAYS` |
| Začiatok dňa | 4:00 | `dayStartHour` |
| Okno na Späť | 6 s | `UNDO_MS` |

Denník ukladá už vypočítané XP, takže zmena hodnôt platí len pre nové splnenia. Ak chceš nové pravidlá aj spätne, pridaj do Nastavení tlačidlo Prepočítať históriu, ktoré XP prepočíta z uloženého `diff`.

Po dvoch týždňoch pozri svoje priemerné denné XP. Keď je ďaleko od 120, uprav radšej krivku levelov než XP za náročnosť, aby ostal pomer medzi úlohami rovnaký.

## Fázy

Najlepšie je stavať po štyroch fázach, aby si mal po prvej už použiteľný to-do list s levelmi a zvyšok ladil podľa skúsenosti.

1. **Základ**: jednorazové úlohy, denník, XP podľa náročnosti, celkový level, záložka Úlohy → Dnes, hláška s tlačidlom Späť a pole `game` v zálohe. *(hotovo)*
   - Navyše hotové: opakované úlohy (všetky typy `repeat` vyššie) a plánovanie v Kalendári – mesačný prehľad s bodkami, úlohy vybraného dňa, pridanie úlohy na konkrétny deň a história splnení minulých dní.
2. **Postava**: atribúty a ich levely, tituly, karta postavy s rovnováhou za 14 dní a rekordmi. *(hotovo – stránka Postava je vľavo od dneška, atribúty sa upravujú v Nastaveniach)*
3. **Návyky**: opakované aktivity, rýchly záznam, hlavná úloha dňa, klesajúci výnos a strop drobností. *(hotovo)*
   - Rýchly záznam: tlačidlo **Záznam** v Úlohách alebo **+ → Rýchly záznam**; názov je nepovinný (bez neho sa použije názov atribútu), nedávne záznamy sa dajú zopakovať jedným ťuknutím a tlačidlá náročnosti ukazujú XP už po uplatnení pravidiel.
   - Hlavná úloha dňa: výzva navrchu dňa, výber zo zoznamu nesplnených úloh; po splnení sa už nedá zmeniť.
   - Záznam v denníku si okrem finálneho `xp` nesie aj `base` a príznaky `main`, `nth` (koľký raz v ten deň) a `capped` (strop drobností); rýchly záznam má `kind: "quick"`.
4. **Prepojenie s appkou**: karta na domovskej obrazovke, riadok na úvodnej obrazovke, história v Kalendári, animácia nového levelu a odomknutia.

Po každej fáze používaj appku aspoň týždeň a až potom pokračuj. Najviac sa naučíš z toho, ktoré čísla ti v praxi nesedia.
