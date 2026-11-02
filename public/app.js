// Tävlingskarta längdskidor
//
// Karta: Lantmäteriet Topografi 1M (Sverige) och Natural Earth (grannländer), byggda till tiles
// med `npm run bygg-karta`. Tävlingar: Svenska Skidförbundets SSF-TA, hämtade till tavlingar.json
// med `npm run hamta-tavlingar`. Detaljer och dokument (PM, inbjudan) hämtas direkt från SSF-TA
// när man klickar på en tävling.

const SSF_API = 'https://api.skidor.com/api/v1';
const SSF_WEBB = 'https://ssfta.skidor.com';
const PRICK_FARG = '#1d4ed8';
const PRICK_RADIE = 6;
// Kartdatan (Topografi 1M) finns bara till zoom 10. Längre in förstoras bara samma ytor,
// tills man bara ser en enda sjö eller skog – därför går det inte att zooma längre.
const MAX_ZOOM = 10;
// Zoom när man väljer en tävling i listan. Bubblorna slår där bara ihop prickar inom ca 3 km,
// så tävlingen syns som egen prick (eller som sin arenas bubbla).
const NARA_ZOOM = 9;

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
    },
    ne: {
      type: 'vector',
      tiles: [bas + 'kartdata/grannland/{z}/{x}/{y}.pbf'],
      minzoom: 2,
      maxzoom: 7,
      bounds: [-25.0, 50.0, 60.0, 73.0], // samma område som i scripts/bygg-karta.mjs
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
  ],
};

const karta = new maplibregl.Map({
  container: 'karta',
  style: stil,
  bounds: [[10.5, 55.0], [24.5, 69.2]], // ungefär Sverige
  // Måste vara bred: hela vyn (inte bara mitten) hålls inom maxBounds, och Sverige är smalt
  maxBounds: [[-25.0, 50.0], [60.0, 73.0]],
  minZoom: 3,
  maxZoom: MAX_ZOOM,
  // Ingen standardruta (den lägger till "MapLibre" och fälls ihop på mobil). Kartan visar bara
  // OpenStreetMap, som krävs eftersom tävlingarnas positioner kommer därifrån; övriga källor
  // (CC0, public domain, BSD) kräver inget och står i stället längst ner i sidomenyn.
  attributionControl: false,
});
karta.addControl(new maplibregl.NavigationControl());
karta.addControl(new maplibregl.AttributionControl({ compact: false }));

const sidomeny = document.getElementById('sidomeny');
const arMobil = () => matchMedia('(max-width: 800px)').matches;

// ---- Datum ----

const lokaltDatum = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const IDAG = lokaltDatum(new Date());

// "21 nov.", "21–23 nov." (samma månad) eller "26 feb. – 7 mars"
function formateraDatum(start, slut) {
  const datum = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const f = (s) => datum(s).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  if (!slut || slut === start) return f(start);
  if (start.slice(0, 7) === slut.slice(0, 7)) return `${datum(start).getDate()}–${f(slut)}`;
  return `${f(start)} – ${f(slut)}`;
}

// Listan delas upp per månad. En tävling som går över två månader hamnar i den månad den börjar.
const manadNyckel = (t) => t.start.slice(0, 7);
function manadRubrik(nyckel) {
  const namn = new Date(+nyckel.slice(0, 4), +nyckel.slice(5, 7) - 1, 1)
    .toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  return namn.charAt(0).toUpperCase() + namn.slice(1);
}

// ---- Hjälpfunktioner för HTML ----

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const arFis = (t) => t.niva === 'FIS';
const klass = (t) => (arFis(t) ? 'fis' : 'ovriga');

// ---- Tävlingar ----

let tavlingar = [];
const perId = new Map();

const forklaringHtml = `
  <p class="forklaring">Klicka på en prick för detaljer. Siffran i en bubbla visar hur många tävlingar som finns där – klicka för att zooma in.</p>`;

function listaHtml(lista) {
  return `<ul class="lista">${lista.map((t) => `
    <li><button type="button" data-id="${t.id}">
      <span class="prick"></span>
      <span class="text">
        <span class="namn">${esc(t.namn)}</span>
        <span class="info">${esc(formateraDatum(t.start, t.slut))} ${esc(t.plats ?? t.distrikt ?? '')}</span>
      </span>    </button></li>`).join('')}</ul>`;
}

function visaOversikt() {
  valj(null);
  let html = `<h2>${tavlingar.length} kommande tävlingar</h2>${forklaringHtml}`;
  // Tävlingarna är redan sorterade på datum, så månaderna kommer i ordning
  const perManad = new Map();
  for (const t of tavlingar) {
    const n = manadNyckel(t);
    if (!perManad.has(n)) perManad.set(n, []);
    perManad.get(n).push(t);
  }
  for (const [nyckel, lista] of perManad) html += `<h3>${esc(manadRubrik(nyckel))}</h3>${listaHtml(lista)}`;
  // OpenStreetMap står redan på kartan och behöver inte upprepas här
  html += `<ul class="kalla">
    <li>Tävlingar: Svenska Skidförbundets <a href="${SSF_WEBB}" target="_blank" rel="noopener">SSF-TA</a></li>
    <li>Karta: <a href="https://www.lantmateriet.se" target="_blank" rel="noopener">Lantmäteriet</a> och
      <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a></li>
    <li>Kartbibliotek: <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a></li>
  </ul>`;
  sidomeny.innerHTML = html;
  sidomeny.scrollTop = 0;
}

function visaFlera(lista) {
  valj(null);
  sidomeny.innerHTML = `
    <button type="button" class="tillbaka">← Alla tävlingar</button>
    <h2>${lista.length} tävlingar här</h2>
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
      <h2>${esc(t.namn)}</h2>      <dl>
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

let valdId = null;

function valj(id) {
  valdId = id;
  uppdateraMarkering();
  const hash = id ? `#${id}` : '';
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

// En nål ovanför den valda tävlingen pekar ner på den. Den följer sammanslagningen: ligger
// tävlingen i en bubbla pekar nålen på bubblan, annars på tävlingens egen prick.
const NAL_AVSTAND = 2; // pixlar mellan prickens ytterkant och nålens spets
let markeringAnrop = 0;

async function uppdateraMarkering() {
  const kalla = karta.getSource('vald');
  if (!kalla) return;
  const anrop = ++markeringAnrop;
  const t = perId.get(valdId);
  if (!t) return kalla.setData({ type: 'FeatureCollection', features: [] });

  let plats = [t.lon, t.lat];
  let ytterkant = PRICK_RADIE + 2; // prickens radie + vit kant
  const tavlingskalla = karta.getSource('tavlingar');
  for (const bubbla of karta.queryRenderedFeatures({ layers: ['kluster'] })) {
    const delar = await tavlingskalla.getClusterLeaves(bubbla.properties.cluster_id, Infinity);
    if (delar.some((f) => f.properties.id === t.id)) {
      plats = bubbla.geometry.coordinates;
      ytterkant = bubbelRadie(bubbla.properties.point_count) + 2;
      break;
    }
  }
  if (anrop !== markeringAnrop) return; // en nyare uppdatering har hunnit starta
  kalla.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: plats }, properties: { hojd: ytterkant + NAL_AVSTAND } }],
  });
}

sidomeny.addEventListener('click', (e) => {
  if (e.target.closest('.tillbaka')) return visaOversikt();
  const knapp = e.target.closest('button[data-id]');
  if (!knapp) return;
  const t = perId.get(+knapp.dataset.id);
  if (!t) return;
  karta.flyTo({ center: [t.lon, t.lat], zoom: Math.max(karta.getZoom(), NARA_ZOOM) });
  visaTavling(t.id);
});

// ---- Bubblor med antal ----

const BUBBLA_TEXT = 12;
// Tre fasta storlekar: färre än 5, 5–14 och 15 eller fler
const bubbelRadie = (antal) => (antal < 5 ? 12 : antal < 15 ? 15 : 19);

// Blå cirkel med vit kant och antalet i Roboto. Ritas i skärmens upplösning så att den blir skarp.
function ritaBubbla(antal) {
  const skala = Math.ceil(devicePixelRatio || 1);
  const kant = 2;
  const radie = bubbelRadie(antal);
  const storlek = (radie + kant) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = storlek * skala;
  const g = canvas.getContext('2d');
  g.scale(skala, skala);
  g.beginPath();
  g.arc(storlek / 2, storlek / 2, radie + kant / 2, 0, 2 * Math.PI);
  g.fillStyle = PRICK_FARG;
  g.fill();
  g.lineWidth = kant;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `500 ${BUBBLA_TEXT}px Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(antal), storlek / 2, storlek / 2 + 0.5);
  return [g.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: skala }];
}

// Mörk kartnål med vit kant och vit prick, spetsen nedåt
function ritaNal() {
  const skala = Math.ceil(devicePixelRatio || 1);
  const bredd = 22, hojd = 30, r = 9, kant = 2;
  const canvas = document.createElement('canvas');
  canvas.width = bredd * skala;
  canvas.height = hojd * skala;
  const g = canvas.getContext('2d');
  g.scale(skala, skala);
  const mx = bredd / 2, my = r + kant / 2, spets = hojd - kant / 2;
  g.beginPath();
  g.arc(mx, my, r, Math.PI * 0.8, Math.PI * 0.2); // övre delen av huvudet
  g.quadraticCurveTo(mx + r * 0.45, my + r * 1.4, mx, spets); // ner till spetsen
  g.quadraticCurveTo(mx - r * 0.45, my + r * 1.4, mx - r * Math.cos(Math.PI * 0.2), my + r * Math.sin(Math.PI * 0.2));
  g.closePath();
  g.fillStyle = '#111827';
  g.fill();
  g.lineWidth = kant;
  g.strokeStyle = '#fff';
  g.stroke();
  g.beginPath();
  g.arc(mx, my, 3.5, 0, 2 * Math.PI);
  g.fillStyle = '#fff';
  g.fill();
  return [g.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: skala }];
}

// ---- Ladda tävlingar och rita dem på kartan ----

async function laddaTavlingar() {
  const svar = await fetch('tavlingar.json');
  const data = await svar.json();
  tavlingar = data.tavlingar.filter((t) => t.slut >= IDAG); // avslutade tävlingar visas inte
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
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    data: {
      type: 'FeatureCollection',
      features: tavlingar.map((t) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
        properties: { id: t.id },
      })),
    },
    // Tävlingar som ligger nära varandra slås ihop till en bubbla med antalet
    cluster: true,
    clusterRadius: 40,
    // Slå ihop ända till största zoom: flera tävlingar på samma arena visas då alltid som en
    // bubbla med antal, i stället för som prickar ovanpå varandra
    clusterMaxZoom: MAX_ZOOM,
  });
  karta.addSource('vald', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  // Bubblorna ritas som bilder av sidan själv (se ritaBubbla), så att siffrorna får samma
  // typsnitt som resten av sidan. Bilden "bubbla-12" skapas första gången den behövs.
  await document.fonts.load(`500 ${BUBBLA_TEXT}px Roboto`);
  karta.on('styleimagemissing', (e) => {
    const antal = /^bubbla-(\d+)$/.exec(e.id)?.[1];
    if (antal && !karta.hasImage(e.id)) karta.addImage(e.id, ...ritaBubbla(+antal));
  });
  karta.addLayer({
    id: 'kluster', type: 'symbol', source: 'tavlingar', filter: ['has', 'point_count'],
    layout: {
      'icon-image': ['concat', 'bubbla-', ['get', 'point_count']],
      'icon-allow-overlap': true,
    },
  });
  karta.addLayer({
    id: 'tavlingar', type: 'circle', source: 'tavlingar', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': PRICK_FARG, 'circle-radius': PRICK_RADIE, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
  });
  karta.addImage('nal', ...ritaNal());
  karta.addLayer({
    id: 'tavlingar-vald', type: 'symbol', source: 'vald',
    layout: {
      'icon-image': 'nal',
      'icon-anchor': 'bottom', // spetsen nederst i bilden
      // Lyft nålen så att spetsen hamnar strax ovanför prickens eller bubblans kant
      'icon-offset': ['match', ['get', 'hojd'],
        ...[12, 15, 19].flatMap((r) => [r + 2 + NAL_AVSTAND, ['literal', [0, -(r + 2 + NAL_AVSTAND)]]]),
        ['literal', [0, -(PRICK_RADIE + 2 + NAL_AVSTAND)]]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  // Bubblorna ändras när man zoomar: göm nålen under zoomningen och placera om den efteråt
  karta.on('zoomstart', () => karta.setLayoutProperty('tavlingar-vald', 'visibility', 'none'));
  // Vänta tills kartan ritat klart, annars är bubblorna för den nya zoomnivån inte på plats än
  karta.on('moveend', () =>
    karta.once('idle', async () => {
      await uppdateraMarkering();
      karta.setLayoutProperty('tavlingar-vald', 'visibility', 'visible');
    })
  );

  // Bubbla: lista tävlingarna i den och zooma in så att alla får plats med marginal.
  // Då hamnar de olika arenorna så långt isär att de visas som egna prickar.
  karta.on('click', 'kluster', async (e) => {
    const bubbla = e.features[0];
    const delar = await karta.getSource('tavlingar').getClusterLeaves(bubbla.properties.cluster_id, Infinity);
    const lista = delar.map((f) => perId.get(f.properties.id)).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
    visaFlera(lista);
    // Alla på samma arena delar aldrig på sig, så då är det ingen idé att zooma
    const lon = lista.map((t) => t.lon);
    const lat = lista.map((t) => t.lat);
    const sammaPlats = Math.min(...lon) === Math.max(...lon) && Math.min(...lat) === Math.max(...lat);
    if (!sammaPlats) {
      karta.fitBounds([[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]], {
        padding: arMobil() ? 40 : 80,
        maxZoom: MAX_ZOOM,
      });
    }
  });

  karta.on('click', 'tavlingar', (e) => visaTavling(e.features[0].properties.id));

  for (const lager of ['kluster', 'tavlingar']) {
    karta.on('mouseenter', lager, () => (karta.getCanvas().style.cursor = 'pointer'));
    karta.on('mouseleave', lager, () => (karta.getCanvas().style.cursor = ''));
  }

  // En länk med #<id> öppnar tävlingen direkt
  const franLank = perId.get(+location.hash.slice(1));
  if (franLank) {
    karta.jumpTo({ center: [franLank.lon, franLank.lat], zoom: NARA_ZOOM });
    visaTavling(franLank.id);
  } else {
    visaOversikt();
  }
});
