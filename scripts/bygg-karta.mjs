// Bygger vektortiles från kartdata i data/:
//   public/kartdata/sverige/   – Lantmäteriets GeoPackage-zippar (Topografi 1M), detaljerat
//   public/kartdata/grannland/ – Natural Earth (10m), grovt och bara till lägre zoom
// Kör: npm run bygg-karta

import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import proj4 from 'proj4';
import wkx from 'wkx';

const DATA = 'data';
const UT = 'public/kartdata';

// Områdena måste stämma med `bounds` i index.html
const SVERIGE = { mapp: 'sverige', omrade: [10.0, 54.8, 25.0, 69.5], minZoom: 2, maxZoom: 10 }; // väst, syd, öst, nord
// Samma område som kartans maxBounds, så att ingen kant syns
const GRANNLAND = { mapp: 'grannland', omrade: [-25.0, 50.0, 60.0, 73.0], minZoom: 2, maxZoom: 7 };

// Lantmäteriet: [zipfil, tabell i GeoPackage, kolumner att behålla, SQL-villkor]
// Bara det som kartan i index.html faktiskt ritar tas med.
const LM_LAGER = [
  ['mark_sverige.zip', 'mark', ['objekttyp'], `objekttyp <> 'Ej karterat område'`],
  ['hydrografi_sverige.zip', 'hydrolinje', []],
  ['administrativindelning_sverige.zip', 'administrativ_grans', ['objekttyp'], `objekttyp IN ('Riksgräns', 'Länsgräns')`],
];

// Natural Earth: [lagernamn, fil i data/natural-earth]
const NE_LAGER = [
  ['land', 'ne_10m_admin_0_countries.geojson'],
  ['sjoar', 'ne_10m_lakes.geojson'],
];

proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const tillWgs84 = proj4('EPSG:3006', 'EPSG:4326');

function projicera(koord) {
  return typeof koord[0] === 'number' ? tillWgs84.forward(koord) : koord.map(projicera);
}

// GeoPackage-geometri = "GP"-header + WKB
function lasGeometri(blob) {
  const buf = Buffer.from(blob);
  const flaggor = buf[3];
  const kuvert = [0, 32, 48, 48, 64][(flaggor >> 1) & 0b111];
  const geom = wkx.Geometry.parse(buf.subarray(8 + kuvert)).toGeoJSON();
  geom.coordinates = projicera(geom.coordinates);
  return geom;
}

function lasLantmateriet() {
  const tmp = mkdtempSync(join(tmpdir(), 'tavlingskarta-'));
  const filer = {};
  const oppnaGpkg = (zipnamn) => {
    if (!filer[zipnamn]) {
      const innehall = unzipSync(readFileSync(join(DATA, zipnamn)));
      const [namn, bytes] = Object.entries(innehall).find(([n]) => n.endsWith('.gpkg'));
      const sokvag = join(tmp, namn);
      writeFileSync(sokvag, bytes);
      filer[zipnamn] = new DatabaseSync(sokvag, { readOnly: true });
    }
    return filer[zipnamn];
  };

  const lager = {};
  for (const [zipnamn, tabell, kolumner, villkor] of LM_LAGER) {
    const rader = oppnaGpkg(zipnamn)
      .prepare(`SELECT ${['geom', ...kolumner.map((k) => `"${k}"`)].join(', ')} FROM "${tabell}"${villkor ? ` WHERE ${villkor}` : ''}`)
      .all();
    lager[tabell] = rader
      .filter((r) => r.geom)
      .map(({ geom, ...egenskaper }) => ({ type: 'Feature', geometry: lasGeometri(geom), properties: egenskaper }));
  }
  for (const db of Object.values(filer)) db.close();
  rmSync(tmp, { recursive: true, force: true });
  return lager;
}

// Yttergränser [väst, syd, öst, nord] för en geometri
function utbredning(koord, b = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (typeof koord[0] === 'number') {
    b[0] = Math.min(b[0], koord[0]); b[1] = Math.min(b[1], koord[1]);
    b[2] = Math.max(b[2], koord[0]); b[3] = Math.max(b[3], koord[1]);
  } else for (const k of koord) utbredning(k, b);
  return b;
}

function lasNaturalEarth() {
  // Bara länder och sjöar som når in i grannlandsområdet
  const [v, s, o, n] = GRANNLAND.omrade;
  const inom = (f) => {
    const [fv, fs, fo, fn] = utbredning(f.geometry.coordinates);
    return fo >= v && fv <= o && fn >= s && fs <= n;
  };
  const lager = {};
  for (const [namn, fil] of NE_LAGER) {
    const { features } = JSON.parse(readFileSync(join(DATA, 'natural-earth', fil), 'utf8'));
    lager[namn] = features.filter(inom).map((f) => ({ ...f, properties: {} }));
  }
  return lager;
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function byggTiles({ mapp, omrade, minZoom, maxZoom }, lager) {
  const index = {};
  for (const [namn, features] of Object.entries(lager)) {
    index[namn] = geojsonvt({ type: 'FeatureCollection', features }, { maxZoom, indexMaxZoom: maxZoom, tolerance: 3, buffer: 64 });
    console.log(`${mapp}/${namn}: ${features.length} objekt`);
  }

  const ut = join(UT, mapp);
  rmSync(ut, { recursive: true, force: true });
  let antal = 0;
  const [v, s, o, n] = omrade;
  for (let z = minZoom; z <= maxZoom; z++) {
    for (let x = lon2x(v, z); x <= lon2x(o, z); x++) {
      for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
        const tile = {};
        for (const [namn, idx] of Object.entries(index)) {
          const t = idx.getTile(z, x, y);
          if (t && t.features.length) tile[namn] = t;
        }
        // Tomma tiles skrivs också, så att webbläsaren inte får 404 inom kartans område
        mkdirSync(join(ut, `${z}`, `${x}`), { recursive: true });
        writeFileSync(join(ut, `${z}`, `${x}`, `${y}.pbf`), vtpbf.fromGeojsonVt(tile, { version: 2 }));
        antal++;
      }
    }
  }
  console.log(`Klart: ${antal} tiles i ${ut}/`);
}

rmSync(UT, { recursive: true, force: true });
byggTiles(SVERIGE, lasLantmateriet());
byggTiles(GRANNLAND, lasNaturalEarth());
