// Tävlingskarta längdskidor
//
// Karta: Lantmäteriet Topografi 1M (Sverige) och Natural Earth (grannländer), byggda till tiles
// med `npm run bygg-karta`. Tävlingar: Svenska Skidförbundets SSF-TA, hämtade till tavlingar.json
// med `npm run hamta-tavlingar`. Detaljer och dokument (PM, inbjudan) hämtas direkt från SSF-TA
// när man klickar på en tävling.

const SSF_API = 'https://api.skidor.com/api/v1';
const SSF_WEBB = 'https://ssfta.skidor.com';
const FARG_FIS = '#d62828';
const FARG_OVRIGA = '#1d4ed8';

const NIVAER = {
  FIS: 'Internationell (FIS)',
  Nordisk: 'Nordisk',
  Nationell: 'Nationell',
  Regional: 'Landsdel',
  Distrikt: 'Distrikt',
  Klubb: 'Klubb',
};

// Byggs som vanlig text: new URL() skulle koda om {z}/{x}/{y} till %7Bz%7D osv.
const bas = location.href.replace(/[^/]*([?#].*)?$/, '');

const stil = {
  version: 8,
  sources: {
    lm: {
      type: 'vector',
      tiles: [bas + 'kartdata/sverige/{z}/{x}/{y}.pbf'],
      minzoom: 2,
      maxzoom: 10,
      bounds: [10.0, 54.8, 25.0, 69.5], // samma område som i scripts/bygg-karta.mjs
      attribution: '© <a href="https://www.lantmateriet.se">Lantmäteriet</a>',
    },
    ne: {
      type: 'vector',
      tiles: [bas + 'kartdata/grannland/{z}/{x}/{y}.pbf'],
      minzoom: 2,
      maxzoom: 7,
      bounds: [-25.0, 50.0, 60.0, 73.0], // samma område som i scripts/bygg-karta.mjs
      attribution: '<a href="https://www.naturalearthdata.com">Natural Earth</a>',
    },
  },
  layers: [
    { id: 'bakgrund', type: 'background', paint: { 'background-color': '#c6dcef' } },
    {
      id: 'grannland', type: 'fill', source: 'ne', 'source-layer': 'land',
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.6 },
    },
    {
      id: 'grannland-sjoar', type: 'fill', source: 'ne', 'source-layer': 'sjoar',
      paint: { 'fill-color': '#c6dcef' },
    },
    {
      id: 'grannland-granser', type: 'line', source: 'ne', 'source-layer': 'land',
      paint: { 'line-color': '#8a7a99', 'line-width': 0.6, 'line-opacity': 0.4 },
    },
    {
      id: 'mark', type: 'fill', source: 'lm', 'source-layer': 'mark',
      paint: {
        'fill-color': ['match', ['get', 'objekttyp'],
          'Skog', '#d5e8c8',
          'Öppen mark', '#f4f1e6',
          'Kalfjäll', '#ece8dc',
          'Glaciär', '#ffffff',
          'Bebyggelse', '#e6d3c8',
          'Vattenyta', '#c6dcef',
          'Hav', '#c6dcef',
          '#f4f1e6'],
      },
    },
    {
      id: 'vattendrag', type: 'line', source: 'lm', 'source-layer': 'hydrolinje',
      paint: { 'line-color': '#9cc0e0', 'line-width': 0.8 },
    },
    {
      id: 'granser', type: 'line', source: 'lm', 'source-layer': 'administrativ_grans',
      paint: {
        'line-color': '#8a7a99',
        'line-width': ['match', ['get', 'objekttyp'], 'Riksgräns', 1.5, 0.7],
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'jarnvag', type: 'line', source: 'lm', 'source-layer': 'ralstrafik', minzoom: 6,
      paint: { 'line-color': '#999999', 'line-width': 0.8 },
    },
  ],
};

const karta = new maplibregl.Map({
  container: 'karta',
  style: stil,
  bounds: [[10.5, 55.0], [24.5, 69.2]], // ungefär Sverige
  // Måste vara bred: hela vyn (inte bara mitten) hålls inom maxBounds, och Sverige är smalt
  maxBounds: [[-25.0, 50.0], [60.0, 73.0]],
  minZoom: 3,
});
karta.addControl(new maplibregl.NavigationControl());

const sidomeny = document.getElementById('sidomeny');
const arMobil = () => matchMedia('(max-width: 800px)').matches;

// ---- Datum ----

const lokaltDatum = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const IDAG = lokaltDatum(new Date());
const tillDag = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
const dagarTill = (s) => tillDag(s) - tillDag(IDAG);

function formateraDatum(start, slut) {
  const f = (s, alt) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).toLocaleDateString('sv-SE', alt);
  if (!slut || slut === start) return f(start, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${f(start, { day: 'numeric', month: 'short' })} – ${f(slut, { day: 'numeric', month: 'short' })}`;
}

function nedrakning(t) {
  if (t.dagar === 0 && t.start < IDAG) return 'Pågår';
  if (t.dagar === 0) return 'I dag';
  if (t.dagar === 1) return 'I morgon';
  if (t.dagar < 14) return `Om ${t.dagar} dagar`;
  if (t.dagar < 60) return `Om ${Math.round(t.dagar / 7)} veckor`;
  return `Om ${Math.round(t.dagar / 30)} mån`;
}

const GRUPPER = [
  { rubrik: 'Pågår och i dag', max: 0 },
  { rubrik: 'Inom en vecka', max: 7 },
  { rubrik: 'Inom en månad', max: 30 },
  { rubrik: 'Senare', max: Infinity },
];

// ---- Hjälpfunktioner för HTML ----

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const arFis = (t) => t.niva === 'FIS';
const klass = (t) => (arFis(t) ? 'fis' : 'ovriga');

// ---- Tävlingar ----

let tavlingar = [];
let hamtad = null;
const perId = new Map();

const forklaringHtml = `
  <div class="forklaring">
    <div><span class="prick fis"></span> FIS-tävling</div>
    <div><span class="prick ovriga"></span> Övriga tävlingar</div>
    <div>Större och starkare prick = närmare i tid. Tjock vit ring = inom en vecka.</div>
  </div>`;

function listaHtml(lista) {
  return `<ul class="lista">${lista.map((t) => `
    <li><button type="button" data-id="${t.id}">
      <span class="prick ${klass(t)}"></span>
      <span class="text">
        <span class="namn">${esc(t.namn)}</span>
        <span class="info">${esc(formateraDatum(t.start, t.slut))} · ${esc(t.plats ?? t.distrikt ?? '')}</span>
      </span>
      <span class="nedrakning${t.dagar <= 7 ? ' snart' : ''}">${nedrakning(t)}</span>
    </button></li>`).join('')}</ul>`;
}

function visaOversikt() {
  valj(null);
  let html = `<h2>${tavlingar.length} kommande tävlingar</h2>${forklaringHtml}`;
  let fran = -1;
  for (const g of GRUPPER) {
    const i = tavlingar.filter((t) => t.dagar > fran && t.dagar <= g.max);
    if (i.length) html += `<h3>${g.rubrik}</h3>${listaHtml(i)}`;
    fran = g.max;
  }
  if (hamtad) html += `<p class="kalla">Från Svenska Skidförbundets SSF-TA, uppdaterad ${esc(new Date(hamtad).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }))}.</p>`;
  sidomeny.innerHTML = html;
  sidomeny.scrollTop = 0;
}

function visaFlera(lista) {
  valj(null);
  sidomeny.innerHTML = `
    <button type="button" class="tillbaka">← Alla tävlingar</button>
    <h2>${lista.length} tävlingar på samma plats</h2>
    ${listaHtml(lista)}`;
  visaSidomeny();
}

async function visaTavling(id) {
  const t = perId.get(id);
  if (!t) return visaOversikt();
  valj(id);
  sidomeny.innerHTML = `
    <button type="button" class="tillbaka">← Alla tävlingar</button>
    <div class="detaljer">
      <span class="etikett ${klass(t)}">${arFis(t) ? 'FIS' : esc(NIVAER[t.niva] ?? t.niva)}</span>
      <h2>${esc(t.namn)}</h2>
      <div class="nedrakning${t.dagar <= 7 ? ' snart' : ''}">${nedrakning(t)}</div>
      <dl>
        <dt>Datum</dt><dd>${esc(formateraDatum(t.start, t.slut))}</dd>
        <dt>Plats</dt><dd>${esc(t.plats ?? '–')}${t.ungefarlig ? '<br><span class="notis">Platsen är okänd – pricken visar bara distriktet.</span>' : ''}</dd>
        <dt>Arrangör</dt><dd>${esc(t.arrangor)}</dd>
        <dt>Nivå</dt><dd>${esc(NIVAER[t.niva] ?? t.niva)}</dd>
        <dt>Typ</dt><dd>${esc(t.typ)}</dd>
        <dt>Status</dt><dd>${esc(t.status)}</dd>
        ${t.distrikt ? `<dt>Distrikt</dt><dd>${esc(t.distrikt)}</dd>` : ''}
      </dl>
      <div id="dokument"><p>Hämtar PM och dokument…</p></div>
      <p><a href="${SSF_WEBB}/event/${t.id}" target="_blank" rel="noopener">Anmälan och all info på SSF-TA ↗</a></p>
    </div>`;
  visaSidomeny();

  const dokument = document.getElementById('dokument');
  try {
    const svar = await fetch(`${SSF_API}/Events/${id}`);
    if (!svar.ok) throw new Error(svar.status);
    const e = await svar.json();
    if (!dokument.isConnected) return; // användaren har hunnit klicka vidare

    const filer = (e.Files ?? []).map((f) => ({
      namn: f.Description || f.FileName,
      url: `${SSF_API}/Events/${id}/Files/${f.Id}`,
      arPm: /\bPM\b/i.test(`${f.Description} ${f.FileName}`),
    }));
    const pm = filer.filter((f) => f.arPm);
    const ovriga = filer.filter((f) => !f.arPm);

    const tavlingsdagar = (e.Competitions ?? [])
      .slice()
      .sort((a, b) => a.Date.localeCompare(b.Date))
      .map((c) => {
        const discipliner = [...new Set((c.Classes ?? []).map((k) => k.Discipline).filter(Boolean))];
        return `<li>${esc(formateraDatum(c.Date.slice(0, 10)))}: ${esc(c.Name)}${discipliner.length ? ` – ${esc(discipliner.join(', '))}` : ''}</li>`;
      });

    dokument.innerHTML = `
      ${pm.length
        ? pm.map((f) => `<a class="pm" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.namn)} (PDF)</a>`).join(' ')
        : '<p>PM är inte publicerat ännu.</p>'}
      ${ovriga.length ? `<h3>Dokument</h3><ul>${ovriga.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.namn)}</a></li>`).join('')}</ul>` : ''}
      ${tavlingsdagar.length ? `<h3>Tävlingar</h3><ul>${tavlingsdagar.join('')}</ul>` : ''}`;
  } catch {
    if (dokument.isConnected) dokument.innerHTML = '<p>Kunde inte hämta PM och dokument från SSF-TA just nu.</p>';
  }
}

// På mobil ligger sidomenyn under kartan. Scrolla så att menyns början hamnar mitt på skärmen:
// då syns både den valda pricken (mitt i kartan) och början av detaljerna.
function visaSidomeny() {
  sidomeny.scrollTop = 0;
  // Direkt hopp: en mjuk scrollning avbryts ibland av kartans flyTo-animation
  if (arMobil()) scrollTo({ top: Math.max(0, sidomeny.offsetTop - innerHeight / 2) });
}

function valj(id) {
  if (karta.getLayer('tavlingar-vald')) karta.setFilter('tavlingar-vald', ['==', ['get', 'id'], id ?? -1]);
  const hash = id ? `#${id}` : '';
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

sidomeny.addEventListener('click', (e) => {
  if (e.target.closest('.tillbaka')) return visaOversikt();
  const knapp = e.target.closest('button[data-id]');
  if (!knapp) return;
  const t = perId.get(+knapp.dataset.id);
  if (!t) return;
  karta.flyTo({ center: [t.lon, t.lat], zoom: Math.max(karta.getZoom(), 6) });
  visaTavling(t.id);
});

// ---- Ladda tävlingar och rita dem på kartan ----

async function laddaTavlingar() {
  const svar = await fetch('tavlingar.json');
  const data = await svar.json();
  hamtad = data.hamtad;
  tavlingar = data.tavlingar
    .filter((t) => t.slut >= IDAG) // avslutade tävlingar visas inte
    .map((t) => ({ ...t, dagar: Math.max(0, dagarTill(t.start)) }));
  for (const t of tavlingar) perId.set(t.id, t);
}

karta.on('load', async () => {
  try {
    await laddaTavlingar();
  } catch {
    sidomeny.innerHTML = '<p>Kunde inte läsa in tävlingarna.</p>';
    return;
  }

  karta.addSource('tavlingar', {
    type: 'geojson',
    attribution:
      'Tävlingar: <a href="https://ssfta.skidor.com">SSF-TA</a> · Platser: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    data: {
      type: 'FeatureCollection',
      features: tavlingar.map((t) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
        properties: { id: t.id, fis: arFis(t), dagar: t.dagar },
      })),
    },
  });

  // Tid kvar visas med storlek och styrka: nära i tid = stor och stark, långt bort = liten och blek
  karta.addLayer({
    id: 'tavlingar', type: 'circle', source: 'tavlingar',
    layout: { 'circle-sort-key': ['-', ['get', 'dagar']] }, // närmast i tid ritas överst
    paint: {
      'circle-color': ['case', ['get', 'fis'], FARG_FIS, FARG_OVRIGA],
      'circle-radius': ['interpolate', ['linear'], ['get', 'dagar'], 0, 9, 14, 7, 60, 5, 120, 4],
      'circle-opacity': ['interpolate', ['linear'], ['get', 'dagar'], 0, 1, 14, 0.85, 60, 0.45, 120, 0.3],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['case', ['<=', ['get', 'dagar'], 7], 2.5, 1],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'dagar'], 0, 1, 60, 0.6],
    },
  });
  karta.addLayer({
    id: 'tavlingar-vald', type: 'circle', source: 'tavlingar',
    filter: ['==', ['get', 'id'], -1],
    paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#000', 'circle-stroke-width': 3 },
  });

  karta.on('click', 'tavlingar', (e) => {
    // Flera tävlingar kan ligga på samma plats – samla alla under klicket
    const { x, y } = e.point;
    const traffar = karta.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], { layers: ['tavlingar'] });
    const lista = [...new Set(traffar.map((f) => f.properties.id))]
      .map((id) => perId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.start.localeCompare(b.start));
    if (lista.length === 1) visaTavling(lista[0].id);
    else if (lista.length > 1) visaFlera(lista);
  });
  karta.on('mouseenter', 'tavlingar', () => (karta.getCanvas().style.cursor = 'pointer'));
  karta.on('mouseleave', 'tavlingar', () => (karta.getCanvas().style.cursor = ''));

  // En länk med #<id> öppnar tävlingen direkt
  const franLank = perId.get(+location.hash.slice(1));
  if (franLank) {
    karta.jumpTo({ center: [franLank.lon, franLank.lat], zoom: 6 });
    visaTavling(franLank.id);
  } else {
    visaOversikt();
  }
});
