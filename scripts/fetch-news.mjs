#!/usr/bin/env node
/*
 * Obzor – zber noviniek.
 * Stiahne RSS zdroje zo scripts/feeds.json, roztriedi správy do okruhov, určí ich štýl,
 * spojí rovnaké správy z viacerých médií a zapíše news.json, ktorý číta appka.
 * Spúšťa ho GitHub Actions (.github/workflows/news.yml) každých 30 minút.
 *
 * Použitie:  node scripts/fetch-news.mjs <výstup.json> [predchádzajúci.json]
 * Test bez internetu:  NEWS_FIXTURES=<priečinok s <id>.xml> node scripts/fetch-news.mjs out.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KEEP_HOURS = 48;
const MAX_ITEMS = 600;
const SUMMARY_MAX = 420;
const FETCH_TIMEOUT = 15000;
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 ObzorNews/1.0';

/* ============================================================
   Text
   ============================================================ */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  laquo: '«', raquo: '»', euro: '€', copy: '©', reg: '®', trade: '™', deg: '°', middot: '·', bull: '•',
  times: '×', shy: '', zwnj: '', zwj: '', Scaron: 'Š', scaron: 'š', Zcaron: 'Ž', zcaron: 'ž',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Yacute: 'Ý', ocirc: 'ô'
};
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : '';
    }
    if (ENTITIES[e] !== undefined) return ENTITIES[e];
    const low = ENTITIES[e.toLowerCase()];
    return low !== undefined ? low : m;
  });
}
const unCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
/** Obsah XML elementu → reťazec (HTML ponechané). */
function content(raw) {
  if (raw == null) return '';
  return raw.includes('<![CDATA[') ? unCdata(raw) : decodeEntities(raw);
}
export function stripHtml(html) {
  return decodeEntities(String(html)
    .replace(/<(script|style|figure|figcaption)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \s]+/g, ' ')
    .trim();
}
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

function cleanSummary(s, title) {
  let t = s
    .replace(/(The post|Príspevok|Článok|Příspěvek|Článek)\s.{0,240}?(appeared first on|sa (prvýkrát|najskôr) (objavil|zobrazil)|se poprvé objevil).*$/i, '')
    .replace(/\s*(Continue reading|Read more|Čítať ďalej|Čítajte viac|Pokračovať v čítaní|Celý článok|Číst dále|Více zde)\.{0,3}\s*(»|›|…)?\s*$/i, '')
    .replace(/\s*\[(…|\.\.\.)\]\s*$/, '…')
    .trim();
  if (!t || norm(t) === norm(title)) return '';
  if (norm(t).startsWith(norm(title)) && t.length < title.length + 20) return '';
  if (t.length > SUMMARY_MAX) {
    const cut = t.slice(0, SUMMARY_MAX);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > SUMMARY_MAX * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  return t;
}

/* ============================================================
   RSS / Atom / RDF parser (bez závislostí)
   ============================================================ */
const esc = (n) => n.replace(/[:.]/g, (c) => '\\' + c);
function tagRaw(block, names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${esc(n)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${esc(n)}>`, 'i'));
    if (m) return m[1];
  }
  return null;
}
function tagsRaw(block, name) {
  const out = [];
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${esc(name)}>`, 'gi');
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}
function parseAttrs(tag) {
  const a = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) a[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? '');
  return a;
}
function openTags(block, name) {
  const re = new RegExp(`<${esc(name)}(\\s[^>]*)?\\/?>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(parseAttrs(m[1] || ''));
  return out;
}
const isImgUrl = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u);

function pickImage(block, html) {
  const media = openTags(block, 'media:content')
    .filter((a) => a.url && ((a.medium || '') === 'image' || /^image\//.test(a.type || '') || (!a.medium && !a.type && isImgUrl(a.url))));
  if (media.length) {
    media.sort((x, y) => (+y.width || 0) - (+x.width || 0));
    const ok = media.find((a) => !a.width || +a.width <= 1400) || media[media.length - 1];
    return ok.url;
  }
  const thumb = openTags(block, 'media:thumbnail').find((a) => a.url);
  if (thumb) return thumb.url;
  const enc = openTags(block, 'enclosure').find((a) => a.url && (/^image\//.test(a.type || '') || isImgUrl(a.url)));
  if (enc) return enc.url;
  const img = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img && !/(pixel|spacer|feeds\.feedburner|1x1)/i.test(img[1])) return decodeEntities(img[1]);
  return '';
}

function pickLink(block) {
  const links = openTags(block, 'link');
  const alt = links.find((a) => a.href && (!a.rel || a.rel === 'alternate'));
  if (alt) return alt.href;
  const orig = tagRaw(block, ['feedburner:origLink']);
  if (orig) return content(orig).trim();
  const l = tagRaw(block, ['link']);
  if (l && content(l).trim()) return content(l).trim();
  const guid = block.match(/<guid(\s[^>]*)?>([\s\S]*?)<\/guid>/i);
  if (guid && /^https?:/i.test(content(guid[2]).trim())) return content(guid[2]).trim();
  return '';
}

export function canonicalUrl(u) {
  try {
    const url = new URL(u.trim());
    url.hash = '';
    [...url.searchParams.keys()].forEach((k) => { if (/^(utm_|fbclid|gclid|ref$|ref_src|ocid|at_medium|at_campaign|rss)/i.test(k)) url.searchParams.delete(k); });
    return url.toString();
  } catch { return u.trim(); }
}

/** Rozparsuje obsah RSS/Atom/RDF kanála na surové položky. */
export function parseFeed(xml, feed) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const now = Date.now();
  const items = [];
  for (const b of blocks) {
    let title = stripHtml(content(tagRaw(b, ['title']) || ''));
    const link = pickLink(b);
    if (!title || !/^https?:/i.test(link)) continue;
    const descHtml = content(tagRaw(b, ['description', 'summary', 'content:encoded', 'content']) || '');
    const fullHtml = content(tagRaw(b, ['content:encoded']) || '');
    const dateRaw = content(tagRaw(b, ['pubDate', 'published', 'dc:date', 'updated']) || '').trim();
    let published = Date.parse(dateRaw);
    if (!Number.isFinite(published) || published > now + 3600e3) published = now;
    const cats = [
      ...tagsRaw(b, 'category').map((c) => stripHtml(content(c))),
      ...openTags(b, 'category').map((a) => a.term || a.label || '').filter(Boolean)
    ].filter(Boolean);

    let source = feed.name;
    let related = [];
    let summary = '';
    if (feed.aggregator) {
      const src = b.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
      if (src) source = stripHtml(content(src[1])) || source;
      const dash = title.lastIndexOf(' - ');
      if (dash > 20) { if (!src) source = title.slice(dash + 3).trim(); title = title.slice(0, dash).trim(); }
      const re = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:&nbsp;|\s| )*<font[^>]*>([\s\S]*?)<\/font>/gi;
      let m;
      while ((m = re.exec(descHtml))) {
        const rt = stripHtml(m[2]), rs = stripHtml(m[3]);
        if (rt && norm(rt) !== norm(title)) related.push({ title: rt, source: rs, url: decodeEntities(m[1]) });
      }
      related = related.slice(0, 6);
    } else {
      summary = cleanSummary(stripHtml(descHtml || fullHtml), title);
    }

    items.push({
      url: canonicalUrl(link),
      title: title.replace(/\s+/g, ' ').trim(),
      summary,
      image: pickImage(b, descHtml + fullHtml),
      published,
      cats,
      source,
      related
    });
  }
  return items;
}

/* ============================================================
   Okruhy (témy). Kmene sú bez diakritiky, zhoda od začiatku slova.
   "=slovo" = presná zhoda, "dve slova" = fráza.
   ============================================================ */
export const TOPICS = {
  slovensko: 'Slovensko', svet: 'Svet', politika: 'Politika', vojna: 'Vojna a konflikty',
  ekonomika: 'Ekonomika a financie', technologie: 'Technológie', veda: 'Veda a vesmír', zdravie: 'Zdravie',
  klima: 'Klíma a príroda', sport: 'Šport', kultura: 'Kultúra a zábava', krimi: 'Krimi a nehody'
};

const RULES = {
  politika: ['vlad', 'parlament', 'poslan', 'minist', 'premier', 'prezident', 'volb', 'volic', 'koalic', 'opozic', 'politi', 'senat', 'kongres', 'referend', 'zakon', 'legislat', 'europarlament', 'diplomat', 'diplomac', 'sankc', 'sanction', 'summit', 'election', 'government', 'parliament', 'senator', 'democrat', 'republican', 'lawmaker', 'cabinet',
    '=fico', '=fica', '=ficom', '=ficovi', '=pellegrini', '=simecka', '=babis', '=fiala', '=trump', '=trumpa', '=trumpov', '=biden', '=orban', '=macron', '=merz', '=starmer', '=smer', '=hlas', '=sns', '=sas', '=kdh', '=ano', '=ods', '=ps', '=nrsr', '=eurokomisia', 'europska komisia', 'evropska komise', 'european commission', 'ursula'],
  vojna: ['vojn', 'valk', '=war', '=wars', 'ukrajin', 'ukrajn', 'ukrain', 'invaz', 'invasion', 'front', 'ofenziv', 'offensive', 'armad', 'army', 'vojak', 'vojensk', 'military', 'soldier', 'troops', 'raket', 'missile', 'dron', 'bombard', 'bomb', 'ostrel', 'ostrel', 'zbran', 'weapon', 'munici', 'ammunition', '=nato', 'hamas', 'hizbal', 'hezbol', 'izrael', 'israel', '=gaza', '=gazy', '=gaze', '=gazu', '=gazou', '=iran', 'iranu', 'iransk', 'konflikt', 'conflict', 'primeri', 'ceasefire', 'teror', 'rukojem', 'hostage', 'okupac', 'kyjev', 'kyiv', '=kiev', 'charkov', 'charkiv', 'donbas', 'donec', 'krym', 'crimea', 'mobiliz', 'putin', 'zelensk', 'kreml', 'kremlin', 'airstrike', 'shelling', 'genocid', 'jemen', 'yemen', 'huti', 'houthi', 'sudan'],
  ekonomika: ['ekonom', 'econom', 'financ', 'burz', 'inflac', 'inflat', '=ecb', '=fed', 'urok', 'sadzb', 'hypot', 'mortgage', 'mzd', 'mzda', '=dane', '=dani', 'danov', 'zdanen', '=dph', 'rozpoct', 'budget', 'deficit', 'dlhu', 'dlhov', 'zadlz', '=hdp', '=gdp', 'bank', '=euro', '=eur', 'eurozon', 'dolar', 'dollar', 'bitcoin', 'krypto', 'crypto', 'investic', 'investor', 'invest', 'firma', 'firmy', 'firem', 'firmam', 'podnik', 'podnikatel', 'business', '=trh', '=trhu', '=trhy', 'trhov', 'market', 'stock', 'akcie', 'akciov', 'akcii', 'tariff', 'tarif', '=clo', '=cla', 'clami', '=ceny', '=cien', 'cenov', 'zdraz', 'zlacn', 'energi', 'energy', 'benzin', 'nafta', 'ropa', 'ropy', '=oil', 'plyn', 'dochodk', 'duchod', 'pension', 'nezamestn', 'unemploy', 'recesi', 'recession', 'export', 'import', 'priemys', 'prumysl', 'industry', 'automobilk', '=zisk', '=zisku', '=zisky', 'ziskov', 'trzb', 'trzeb', 'profit', 'revenue', 'earnings', 'akvizic', 'acquisition', 'fuzi', 'merger', 'startup', 'nehnutel', 'nemovit', 'real estate', 'spotrebitel', 'spotrebit', 'consumer', 'obchod', 'retail', 'predaj', 'prodej', 'sales', 'layoff', 'prepust'],
  technologie: ['technolog', 'tech', '=ai', 'umela inteligenc', 'umelou inteligenc', 'umelej inteligenc', 'artificial intelligence', 'chatbot', '=cip', '=cipy', 'cipov', 'cipu', '=chip', '=chips', 'semicond', 'polovodic', 'softver', 'software', 'aplikaci', 'aplikac', 'smartfon', 'smartphone', '=mobil', 'mobilu', 'mobiln', 'mobilov', 'iphone', 'android', 'google', 'apple', 'microsoft', 'openai', 'chatgpt', 'gemini', 'claude', 'anthropic', '=meta', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'youtube', '=tesla', 'robot', 'kyber', 'cyber', 'hacker', 'haker', 'hack', 'internet', 'nvidia', 'samsung', 'elektromobil', 'electric vehicle', 'digital', 'algoritm', 'algorithm', 'procesor', 'processor', 'wifi', '=5g', 'spacex', 'starlink', '=musk', 'muska', 'quantum', 'kvantov', 'gadget', 'konzol', 'playstation', 'xbox', 'nintendo', '=hry', 'gaming', 'videohr', 'pocitac', 'computer', 'laptop', 'notebook', 'dataset', 'datov', 'cloud', 'server', 'platform', 'platforma', 'socialn siet', 'social media', 'deepfake', 'bateri', 'battery'],
  veda: ['vedc', 'vedk', 'vedeck', 'vyskum', 'vyzkum', 'research', 'scien', 'studi', 'vesmir', '=space', 'kozmick', 'kosmick', '=nasa', '=esa', 'planet', 'astronaut', 'kozmonaut', 'kosmonaut', 'fyzik', 'physic', 'chemi', 'biolog', 'genet', '=dna', 'objav', 'objev', 'discover', 'archeolog', 'fosil', 'fossil', 'dinosaur', 'teleskop', 'telescope', '=mars', 'asteroid', 'komet', 'galax', 'evoluc', 'mikrob', 'neuro', 'nobel', '=moon', 'sonda', 'druzic', 'satelit', 'satellite', 'laborator', 'experiment', 'matematik', 'vedci'],
  zdravie: ['zdravi', 'zdravot', 'health', 'nemocnic', 'hospital', 'lekar', 'doctor', 'pacient', 'patient', 'virus', 'viru', 'chripk', '=flu', 'ockov', 'vakcin', 'vaccin', 'rakovin', 'cancer', 'onkolog', 'liek', '=lek', 'leky', 'lieciv', 'medicin', 'epidemi', 'pandem', 'covid', 'infekc', 'infection', 'diabet', 'obezit', 'obesity', 'stravovan', '=who', 'mental', 'depresi', 'dusevn', 'alzheim', 'ambulanc', 'zachrank', 'nemoc', 'chorob', 'disease', 'srdcov', 'mozg', 'spanok', 'spanek', 'sleep', 'fitness', 'cvicen', 'exercise', 'vitamin', 'poistov'],
  klima: ['klim', 'climat', 'pocasi', 'weather', 'povod', 'flood', 'sucho', 'drought', 'horuc', 'vedr', 'heatwave', 'poziar', 'pozar', 'wildfire', 'emisi', 'emission', '=co2', 'ekolog', 'environment', 'prirod', 'nature', 'zemetras', 'zemetres', 'earthquake', 'hurikan', 'hurricane', 'tajfun', 'typhoon', 'tornad', 'burk', 'storm', 'lavin', 'ladovc', 'glacier', 'uhlik', 'carbon', 'obnoviteln', 'renewable', 'solarn', 'fotovolt', 'vetern', 'biodiverz', 'zviera', 'zvirat', 'animal', 'wildlife', '=lesy', 'lesov', 'medved', 'vlk', 'ocean', 'znecist', 'pollution', 'plast', 'odpad', 'waste', 'recykl', 'sopka', 'volcan', 'tsunami'],
  sport: ['futbal', 'fotbal', 'football', 'soccer', 'hokej', 'hockey', 'tenis', 'tennis', 'olymp', 'zapas', 'match', 'liga', 'league', 'reprezent', '=gol', '=goly', 'golov', '=goal', 'trener', 'coach', '=f1', 'formul', 'majstrovstv', 'mistrovstv', 'sampion', 'champion', 'turnaj', 'tournament', 'cyklist', 'atlet', 'lyzov', 'lyzar', 'biatlon', '=nhl', '=nba', 'uefa', 'fifa', 'sport', 'hrac', 'player', 'slovan', 'sparta', 'slavia', 'extralig', 'bundeslig', 'premier league', 'champions league', 'liga majstrov', 'wimbledon', 'maraton', 'marathon', 'plavan', 'vlachovsk', 'kolesar', 'slafkovsk'],
  kultura: ['film', 'kino', 'cinema', 'hudb', 'music', 'koncert', 'concert', 'herec', 'hereck', 'actor', 'actress', 'divadl', 'theat', 'kniha', 'knihy', 'knih', 'book', 'serial', 'festival', 'umelec', 'umelk', 'vystav', 'exhibit', 'celebrit', 'spevak', 'spevack', 'zpevak', 'zpevac', 'album', 'oscar', 'grammy', 'netflix', 'hbo', 'galeri', 'muze', 'balet', 'opera', 'literat', 'spisovat', 'reziser', 'moderator', 'influencer', 'showbiz', 'televiz', 'kultur', 'culture', 'pesnic', 'pisnic', 'song', 'rapper', 'raper', 'disney', 'marvel', 'eurovizi'],
  krimi: ['polici', 'police', 'vrazd', 'murder', 'zabil', 'zabit', 'killed', 'nehod', 'crash', 'accident', 'havari', 'zranen', 'injur', '=sud', '=sudu', 'sudny', 'sudkyn', 'sudc', 'soud', 'court', 'obzalob', 'obvinen', 'charged', 'zatkn', 'zadrz', 'arrest', 'podvod', 'fraud', 'korupc', 'corrupt', 'kradez', 'kradol', 'kradl', 'theft', 'lupez', 'strelb', 'shooting', 'tragedi', 'tragick', 'umrtie', 'zomrel', 'zemrel', 'vazb', 'vazen', 'prison', 'vezen', 'kriminal', 'crime', 'prokurat', 'prosecut', 'vysetrov', 'investigat', 'obet', 'mrtv', 'dead', 'utek', 'ukradn', 'znasil', 'drog'],
  slovensko: ['slovensk', 'slovak', 'bratislav', 'kosic', 'presov', 'zilin', 'nitra', 'nitre', 'nitrian', 'banska bystrica', 'banskej bystrici', 'trnav', 'trencin', 'poprad', '=nrsr', '=sr', 'tatr', 'fico', 'pellegrini', 'simeck', 'matovic', 'sulik', 'sutaj', 'kalinak', 'kamenick', 'tarab', 'danko', 'gasparovic', 'caputov', 'stvr', 'rtvs', 'dialnic', '=d1', 'nbs', 'zeleznic'],
  svet: ['=usa', '=eu', 'europsk', 'evropsk', 'europe', 'nemeck', 'nemec', 'nemci', 'german', 'francuz', 'franci', 'french', 'france', 'britan', 'british', 'londyn', 'london', 'washington', 'americk', 'america', '=cina', '=ciny', 'cinsk', 'china', 'chinese', 'japon', 'japan', '=india', 'indie', 'indii', 'indick', 'afrik', 'africa', 'rusk', 'russia', 'moskv', 'moscow', 'ukrajin', 'ukrain', 'izrael', 'israel', 'turec', 'turk', 'polsk', 'poland', 'polish', 'madar', 'hungar', 'rakus', 'austri', 'taliansk', 'italy', 'italian', 'spanielsk', 'spain', 'orban', 'trump', 'putin', 'zelensk', 'macron', '=osn', '=un', 'united nations', 'brusel', 'brussels', 'kanad', 'canada', 'brazil', 'mexik', 'mexico', 'korej', 'korea', 'taiwan', 'tchaj', 'austral', 'venezuel', 'syri', 'irak', 'iraq', 'afgan', 'pakistan', 'saudsk', 'saudi']
};
// Pravidlá rozdelené na: presné slová, frázy a kmene – kvôli rýchlosti.
const COMPILED = Object.fromEntries(Object.entries(RULES).map(([t, list]) => [t, {
  exact: new Set(list.filter((s) => s.startsWith('=')).map((s) => norm(s.slice(1)))),
  phrases: list.filter((s) => !s.startsWith('=') && s.includes(' ')).map(norm),
  stems: list.filter((s) => !s.startsWith('=') && !s.includes(' ')).map(norm)
}]));

function topicHits(toks, text, rule) {
  let n = 0;
  for (const t of toks) {
    if (rule.exact.has(t)) n++;
    else if (t.length >= 3 && rule.stems.some((s) => t.startsWith(s))) n++;
  }
  for (const p of rule.phrases) if (text.includes(' ' + p)) n++;
  return n;
}

export function classify(item, feed) {
  const tTitle = tokens(item.title), tSum = tokens(item.summary), tCats = tokens(item.cats.join(' '));
  const pTitle = ' ' + tTitle.join(' ') + ' ', pSum = ' ' + tSum.join(' ') + ' ', pCats = ' ' + tCats.join(' ') + ' ';
  const scores = {};
  for (const [topic, rule] of Object.entries(COMPILED)) {
    const s = Math.min(2, topicHits(tTitle, pTitle, rule)) * 2 + Math.min(2, topicHits(tSum, pSum, rule)) + Math.min(1, topicHits(tCats, pCats, rule)) * 2;
    if (s) scores[topic] = s;
  }
  for (const h of feed.hint || []) scores[h] = (scores[h] || 0) + 2;
  // obete vojny nie sú krimi
  if (scores.vojna >= 2) delete scores.krimi;
  return Object.entries(scores).filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
}

/** Štýl správy – z toho sa appka učí, aký typ článkov ťa baví. */
export function styleOf(item) {
  const s = [];
  const all = ' ' + tokens(item.title + ' ' + item.cats.join(' ') + ' ' + item.url).join(' ') + ' ';
  const t = tokens(item.title).join(' ');
  if (/ (analyz|analys|koment|nazor|glos|editorial|opinion|column|rozhovor|interview|podcast|esej|essay|reportaz|nazory|publicistik)/.test(all)) s.push('analyza');
  if (/ (online|live|minuta po minute|minutu po minute|sledujeme|aktualizovane|breaking) /.test(all)) s.push('live');
  if (/^(preco|ako|co|kto|kedy|kde|proc|jak|why|how|what|who) /.test(t + ' ') || / (co vieme|co vime|vysvetl|explainer|explained)/.test(' ' + t)) s.push('vysvetlenie');
  if (/\?\s*$/.test(item.title)) s.push('otazka');
  if (/\d/.test(item.title)) s.push('cisla');
  const len = item.summary.length;
  s.push(len === 0 ? 'bez-perexu' : len < 160 ? 'kratka' : len > 320 ? 'dlha' : 'stredna');
  if (item.image) s.push('obrazok');
  return s;
}

/* ============================================================
   Spájanie rovnakých správ z rôznych médií
   ============================================================ */
const STOP = new Set(('ktory ktora ktore ktori ktoreho ktoru ktery ktera ktere kteri ako aj ale ani alebo nebo pred podla podle proti medzi mezi este jeste uz len jen budu bude byt bol bola boli bolo bylo byla byly jsou sme ste som jsem tento tato toto tieto tyto tak teda takze preto proto kvoli kvuli pre pro nad pod cez pres pri bez ich jeho jej jejich svoje svoj svuj their there this that with from have has will would about after over into says said what when which while your more most than then they them were been also just only novy nova nove dnes vcera zajtra roka rokov roku rokoch year years ludi lidi people slovensko slovenska slovenske slovensku cesko ceska ceske online video foto fotky galeria clanok prvy prva prve dalsi dalsie dalsich mozno muze moze mohli mohol chce chcu stale uplne velmi viac vice menej mene new says could should first after before still over under what heres here').split(' '));
export function clusterKeys(title) {
  return [...new Set(tokens(title).filter((t) => t.length >= 4 && !STOP.has(t)).map((t) => t.slice(0, 6)))];
}
function similar(a, b) {
  let inter = 0;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(big);
  for (const k of small) if (set.has(k)) inter++;
  if (!small.length) return false;
  const overlap = inter / small.length;
  return (inter >= 3 && overlap >= 0.45) || (inter >= 2 && overlap >= 0.67 && small.length <= 4);
}
export function cluster(items) {
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const keys = items.map((it) => clusterKeys(it.title));
  const relKeys = items.map((it) => (it.related || []).map((r) => clusterKeys(r.title)));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (Math.abs(items[i].published - items[j].published) > 36 * 3600e3) continue;
      if (similar(keys[i], keys[j]) || relKeys[i].some((k) => similar(k, keys[j])) || relKeys[j].some((k) => similar(k, keys[i]))) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map();
  items.forEach((it, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it); });
  for (const g of groups.values()) {
    const sources = new Set();
    g.forEach((it) => { sources.add(norm(it.source)); (it.related || []).forEach((r) => sources.add(norm(r.source))); });
    const cid = g.map((it) => it.id).sort()[0];
    g.forEach((it) => { it.cluster = cid; it.clusterSize = sources.size; });
  }
  return items;
}

/* ============================================================
   Sťahovanie
   ============================================================ */
function decodeBody(buf, contentType) {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 300));
  const fromHeader = (contentType.match(/charset=["']?([\w-]+)/i) || [])[1];
  const fromXml = (head.match(/encoding=["']([\w-]+)["']/i) || [])[1];
  const tryDec = (enc) => { try { return new TextDecoder(enc.toLowerCase()).decode(buf); } catch { return null; } };
  const candidates = [fromHeader, fromXml, 'utf-8', 'windows-1250'].filter(Boolean);
  let best = null, bestBad = Infinity;
  for (const enc of candidates) {
    const txt = tryDec(enc);
    if (txt == null) continue;
    const bad = (txt.match(/�/g) || []).length;
    if (bad === 0) return txt;
    if (bad < bestBad) { best = txt; bestBad = bad; }
  }
  return best || '';
}

async function loadFeed(feed) {
  const t0 = Date.now();
  let xml;
  if (process.env.NEWS_FIXTURES) {
    let buf;
    try { buf = await readFile(join(process.env.NEWS_FIXTURES, feed.id + '.xml')); }
    catch { throw new Error('fixture chýba'); }
    xml = decodeBody(new Uint8Array(buf), '');
  } else {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    xml = decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') || '');
  }
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('nie je to RSS');
  return { raw: parseFeed(xml, feed), ms: Date.now() - t0 };
}

async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}

const hashId = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

export async function build(feeds, prev) {
  const now = Date.now();
  const status = [];
  const fresh = [];
  await pool(feeds, CONCURRENCY, async (feed) => {
    try {
      const { raw, ms } = await loadFeed(feed);
      let n = 0;
      for (const r of raw) {
        if (now - r.published > KEEP_HOURS * 3600e3) continue;
        const it = {
          id: hashId(feed.aggregator ? norm(r.title) + '|' + norm(r.source) : r.url),
          title: r.title, summary: r.summary, url: r.url, image: r.image,
          source: r.source, feed: feed.id, lang: feed.lang, published: r.published,
          cats: r.cats, related: r.related
        };
        it.topics = classify(it, feed);
        it.style = styleOf(it);
        fresh.push(it); n++;
      }
      status.push({ id: feed.id, name: feed.name, lang: feed.lang, ok: true, count: n, ms });
    } catch (e) {
      status.push({ id: feed.id, name: feed.name, lang: feed.lang, ok: false, count: 0, error: String(e && e.message || e).slice(0, 120) });
    }
  });

  // Duplicity (ten istý článok vo viacerých rubrikách toho istého média)
  const byId = new Map();
  const byTitle = new Map();
  for (const it of fresh) {
    const tk = norm(it.source) + '|' + norm(it.title);
    if (byId.has(it.id) || byTitle.has(tk)) {
      const other = byId.get(it.id) || byTitle.get(tk);
      other.topics = [...new Set([...other.topics, ...it.topics])].slice(0, 3);
      continue;
    }
    byId.set(it.id, it); byTitle.set(tk, it);
  }
  // Staršie správy z minulého behu (kanály ukazujú len posledných pár desiatok)
  for (const old of (prev && prev.items) || []) {
    const pub = Date.parse(old.published);
    if (byId.has(old.id) || now - pub > KEEP_HOURS * 3600e3) continue;
    const tk = norm(old.source) + '|' + norm(old.title);
    if (byTitle.has(tk)) continue;
    const it = { ...old, published: pub, cats: [], related: old.related || [] };
    byId.set(it.id, it); byTitle.set(tk, it);
  }

  let items = [...byId.values()].sort((a, b) => b.published - a.published).slice(0, MAX_ITEMS);
  items = cluster(items);
  const out = items.map((it) => {
    const o = {
      id: it.id, title: it.title, summary: it.summary, url: it.url, source: it.source, feed: it.feed, lang: it.lang,
      published: new Date(it.published).toISOString(), topics: it.topics, style: it.style,
      cluster: it.cluster, clusterSize: it.clusterSize
    };
    if (it.image) o.image = it.image;
    if (it.related && it.related.length) o.related = it.related;
    return o;
  });
  status.sort((a, b) => feeds.findIndex((f) => f.id === a.id) - feeds.findIndex((f) => f.id === b.id));
  return { version: 1, generated: new Date(now).toISOString(), topics: TOPICS, feeds: status, items: out };
}

async function main() {
  const outPath = process.argv[2] || 'news.json';
  const prevPath = process.argv[3];
  const { feeds } = JSON.parse(await readFile(join(HERE, 'feeds.json'), 'utf8'));
  let prev = null;
  if (prevPath) { try { prev = JSON.parse(await readFile(prevPath, 'utf8')); } catch { prev = null; } }
  const data = await build(feeds, prev);
  await writeFile(outPath, JSON.stringify(data));
  const ok = data.feeds.filter((f) => f.ok).length;
  console.log(`Zdroje: ${ok}/${data.feeds.length} v poriadku, správ: ${data.items.length}`);
  for (const f of data.feeds) console.log(`${f.ok ? 'OK  ' : 'CHYBA'} ${f.id.padEnd(18)} ${f.ok ? f.count + ' správ' : f.error}`);
  if (ok === 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
