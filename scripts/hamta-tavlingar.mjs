// Hämtar längdskidtävlingar från Svenska Skidförbundets SSF-TA och skriver public/tavlingar.json.
//
// Platserna i SSF-TA är fritext ("Södra Berget Sundsvall", "Impilo Skidstadion" ...). De placeras så här:
//   1. scripts/platser-manuellt.json – handskrivna rättelser, nyckel = platsen exakt som i SSF-TA
//   2. OpenStreetMaps Nominatim, med olika varianter av plats- och arrangörsnamnet. En träff godtas
//      bara om den ligger i ett län som hör till tävlingens distrikt. Svaren sparas i
//      scripts/geokod-cache.json så att varje sökning bara görs en gång.
//   3. Distriktets mittpunkt (markeras som ungefärlig plats)
//
// Kör: npm run hamta-tavlingar

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://api.skidor.com/api/v1';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'tavlingskarta (https://github.com/CodeByCalle/tavlingskarta)';
const MANUELLT = 'scripts/platser-manuellt.json';
const CACHE = 'scripts/geokod-cache.json';
const UT = 'public/tavlingar.json';
const SIDSTORLEK = 100; // API:t returnerar som mest 100 evenemang per anrop

// Skidförbundets distrikt: vilka län en plats får ligga i, och en ungefärlig mittpunkt [lat, lon]
const DISTRIKT = {
  'Blekinge': { lan: ['Blekinge'], mitt: [56.25, 15.3] },
  'Bohuslän-Dal': { lan: ['Västra Götalands'], mitt: [58.6, 11.9] },
  'Dalarna': { lan: ['Dalarnas'], mitt: [61.0, 14.6] },
  'Gotland': { lan: ['Gotlands'], mitt: [57.5, 18.5] },
  'Gästrikland': { lan: ['Gävleborgs'], mitt: [60.6, 16.7] },
  'Göteborg': { lan: ['Västra Götalands'], mitt: [57.7, 11.97] },
  'Halland': { lan: ['Hallands'], mitt: [56.9, 12.7] },
  'Hälsingland': { lan: ['Gävleborgs', 'Jämtlands'], mitt: [61.7, 16.2] },
  'Jämtland-Härjedalen': { lan: ['Jämtlands'], mitt: [63.0, 14.0] },
  'Medelpad': { lan: ['Västernorrlands'], mitt: [62.4, 16.6] },
  'Norrbotten': { lan: ['Norrbottens'], mitt: [66.8, 20.5] },
  'Skåne': { lan: ['Skåne'], mitt: [55.9, 13.5] },
  'Småland': { lan: ['Jönköpings', 'Kronobergs', 'Kalmar'], mitt: [57.2, 14.8] },
  'Stockholm': { lan: ['Stockholms'], mitt: [59.35, 18.05] },
  'Södermanland': { lan: ['Södermanlands', 'Stockholms'], mitt: [59.1, 16.8] },
  'Uppland': { lan: ['Uppsala', 'Stockholms'], mitt: [60.0, 17.6] },
  'Värmland': { lan: ['Värmlands'], mitt: [59.8, 13.2] },
  'Västerbotten': { lan: ['Västerbottens'], mitt: [64.7, 18.5] },
  'Västergötland': { lan: ['Västra Götalands', 'Jönköpings'], mitt: [58.1, 13.4] },
  'Västmanland': { lan: ['Västmanlands', 'Örebro', 'Dalarnas'], mitt: [59.7, 16.3] },
  'Ångermanland': { lan: ['Västernorrlands', 'Västerbottens'], mitt: [63.3, 17.6] },
  'Örebro Län': { lan: ['Örebro'], mitt: [59.3, 15.0] },
  'Östergötland': { lan: ['Östergötlands'], mitt: [58.4, 15.6] },
};

// Ord som beskriver anläggningen eller klubben snarare än orten
const ALLMANNA_ORD = /\b(skidstadion|skidstadium|skidstuga|skidstugan|stadion|arena|ip|elljusspåret|friluftscentrum|skidklubb|skidförening|allmänna|if:s|ifk|if|sk|ik|gif|ok|skg|sok|ski|ski center|cup)\b/giu;

const vanta = (ms) => new Promise((r) => setTimeout(r, ms));
const datum = (s) => (s ? s.slice(0, 10) : null);
const lasJson = (fil) => (existsSync(fil) ? JSON.parse(readFileSync(fil, 'utf8')) : {});
const sparaJson = (fil, data) =>
  writeFileSync(fil, JSON.stringify(Object.fromEntries(Object.entries(data).sort()), null, 2) + '\n');

// fetch med några nya försök vid nätverksfel
async function hamta(url, alternativ, forsok = 3) {
  for (let i = 1; ; i++) {
    try {
      const svar = await fetch(url, alternativ);
      if (!svar.ok) throw new Error(`${url}: ${svar.status}`);
      return await svar.json();
    } catch (fel) {
      if (i >= forsok) throw fel;
      await vanta(2000 * i);
    }
  }
}

// API:t ger evenemang från ett visst datum och framåt, sorterade på startdatum.
// Vi bläddrar framåt från sista datumet tills en sida har färre än 100 evenemang.
async function hamtaEvenemang(fran) {
  const alla = new Map();
  let start = fran;
  for (;;) {
    const [y, m, d] = start.split('-').map(Number);
    const sida = await hamta(`${API}/Events?sectorCode=CC&year=${y}&month=${m}&day=${d}`);
    for (const e of sida) alla.set(e.Id, e);
    if (sida.length < SIDSTORLEK) break;
    let nasta = datum(sida.at(-1).StartDate);
    if (nasta === start) {
      // Fler än 100 evenemang samma dag – hoppa fram en dag för att inte fastna
      const dag = new Date(`${start}T12:00:00Z`);
      dag.setUTCDate(dag.getUTCDate() + 1);
      nasta = dag.toISOString().slice(0, 10);
    }
    start = nasta;
    await vanta(500);
  }
  return [...alla.values()];
}

const manuellt = lasJson(MANUELLT);
const cache = lasJson(CACHE);

// Nominatims användarvillkor: högst ett anrop per sekund och en User-Agent som säger vem vi är
async function nominatim(q) {
  if (!(q in cache)) {
    const url = `${NOMINATIM}?format=jsonv2&countrycodes=se&limit=10&q=${encodeURIComponent(q)}`;
    const traffar = await hamta(url, { headers: { 'User-Agent': USER_AGENT } });
    await vanta(1100);
    cache[q] = traffar.map((t) => ({ lat: +(+t.lat).toFixed(5), lon: +(+t.lon).toFixed(5), namn: t.display_name }));
    sparaJson(CACHE, cache); // spara direkt, så att inget går förlorat om körningen avbryts
  }
  return cache[q];
}

// Sökvarianter, från mest till minst specifik
function varianter(e) {
  const plats = (e.Place ?? '').trim();
  const ut = [];
  const lagg = (s) => {
    s = s.replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    if (s.length >= 3 && !ut.includes(s)) ut.push(s);
  };
  if (plats) {
    lagg(plats);
    for (const del of plats.match(/\(([^)]+)\)/g) ?? []) lagg(del.slice(1, -1));
    const utanParentes = plats.replace(/\([^)]*\)/g, ' ');
    const delar = utanParentes.split(/,| - |&|\.\s/).map((s) => s.trim()).filter(Boolean);
    for (const del of delar.reverse()) lagg(del); // sista delen är ofta orten
    for (const del of delar) lagg(del.replace(ALLMANNA_ORD, ' '));
    for (const del of delar) for (const s of del.split('-')) lagg(s.replace(ALLMANNA_ORD, ' '));
    const ord = utanParentes.replace(ALLMANNA_ORD, ' ').split(/[\s,&.-]+/).filter((o) => o.length >= 4);
    for (const o of ord.reverse()) lagg(o);
  }
  // Arrangörens namn innehåller ofta orten, t.ex. "Skellefteå SKG" eller "IFK Umeå"
  lagg((e.OrganizerName ?? '').replace(ALLMANNA_ORD, ' '));
  return ut;
}

async function geokoda(e) {
  const plats = (e.Place ?? '').trim();
  if (manuellt[plats]) return { lat: manuellt[plats].lat, lon: manuellt[plats].lon, ungefarlig: false };

  const distrikt = DISTRIKT[e.District];
  const iRattLan = (t) => !distrikt || distrikt.lan.some((l) => t.namn.includes(`${l} län`));
  for (const q of varianter(e)) {
    const traff = (await nominatim(q)).find(iRattLan);
    if (traff) return { lat: traff.lat, lon: traff.lon, ungefarlig: false };
  }
  if (distrikt) return { lat: distrikt.mitt[0], lon: distrikt.mitt[1], ungefarlig: true };
  return null;
}

// Ta med evenemang som startat de senaste dagarna, så att pågående flerdagarstävlingar syns
const fran = new Date();
fran.setDate(fran.getDate() - 7);
const evenemang = await hamtaEvenemang(fran.toISOString().slice(0, 10));
console.log(`${evenemang.length} evenemang hämtade`);

// Evenemangstyperna kommer på engelska ("FIS Race"); slå upp de svenska namnen
const typer = Object.fromEntries(
  (await hamta(`${API}/EventTypes`)).filter((t) => t.SectorCode === 'CC').map((t) => [t.Name, t.LocalName])
);

const tavlingar = [];
const ungefarliga = [];
const utanPlats = [];
for (const e of evenemang.sort((a, b) => a.StartDate.localeCompare(b.StartDate))) {
  if (e.EventStatus === 'Inställt') continue;
  const beskrivning = `${e.Id} ${e.Name} (plats: ${e.Place?.trim() || '–'}, arrangör: ${e.OrganizerName}, distrikt: ${e.District || '–'})`;
  if (e.District && !DISTRIKT[e.District]) console.warn(`Okänt distrikt "${e.District}": ${beskrivning}`);
  const pos = await geokoda(e);
  if (!pos) {
    utanPlats.push(beskrivning);
    continue;
  }
  if (pos.ungefarlig) ungefarliga.push(beskrivning);
  tavlingar.push({
    id: e.Id,
    namn: e.Name,
    start: datum(e.StartDate),
    slut: datum(e.EndDate) ?? datum(e.StartDate),
    plats: e.Place?.trim() || null,
    distrikt: e.District || null,
    arrangor: e.OrganizerName,
    niva: e.GeographicalScope,
    typ: typer[e.EventType] ?? e.EventType,
    status: e.EventStatus,
    ...pos,
  });
}

writeFileSync(UT, JSON.stringify({ hamtad: new Date().toISOString(), tavlingar }, null, 1) + '\n');
console.log(`${tavlingar.length} tävlingar i ${UT}`);
if (ungefarliga.length) console.log(`Ungefärlig plats (distriktets mitt) – rätta i ${MANUELLT}:\n  ${ungefarliga.join('\n  ')}`);
if (utanPlats.length) console.log(`Kunde inte placeras alls (visas inte):\n  ${utanPlats.join('\n  ')}`);
