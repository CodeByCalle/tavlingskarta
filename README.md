# Tävlingskarta längdskidor

En karta över kommande längdskidtävlingar i Sverige. Tävlingarna hämtas från Svenska Skidförbundets SSF-TA. Tävlingar som ligger nära varandra visas som en bubbla med antalet; klicka för att zooma in. Klicka på en enskild prick för detaljer, PM och dokument.

## Struktur

- `public/` – själva webbplatsen. Det är bara den här mappen som publiceras.
  - `index.html`, `stil.css` – sidans uppbyggnad och utseende. På dator ligger sidomenyn till höger om kartan, på mobil under.
  - `app.js` – kartan (MapLibre GL), prickarna och sidomenyn. Detaljer och dokument för en tävling hämtas direkt från SSF-TA när man klickar.
  - `tavlingar.json` – tävlingarna med position, skapad av `npm run hamta-tavlingar`.
  - `kartdata/` – färdiga vektortiles, byggda av `npm run bygg-karta`.
- `scripts/hamta-tavlingar.mjs` – hämtar tävlingar från SSF-TA och placerar dem på kartan.
- `scripts/platser-manuellt.json` – handskrivna positioner för platser som hamnar fel (se nedan).
- `scripts/geokod-cache.json` – sparade svar från platssökningen, så att varje plats bara slås upp en gång.
- `scripts/bygg-karta.mjs` – gör om kartans rådata i `data/` till tiles i `public/kartdata/`.
- `data/` – kartans rådata. Ligger inte i git, se nedan hur den laddas ner.

## Köra lokalt

```
npm install
npm start
```

Öppna adressen som skrivs ut (oftast http://localhost:3000). Sidan fungerar inte om man öppnar `index.html` direkt från disken, eftersom webbläsaren då inte får hämta kartdatan.

## Tävlingarna

`npm run hamta-tavlingar` hämtar alla kommande längdskidevenemang från SSF-TA:s API (`api.skidor.com`, samma som [ssfta.skidor.com](https://ssfta.skidor.com) använder) och skriver `public/tavlingar.json`. Inställda tävlingar tas inte med. På GitHub körs det automatiskt varje natt.

Platserna i SSF-TA är fritext, t.ex. "Södra Berget Sundsvall" eller "Impilo Skidstadion". De slås upp i OpenStreetMaps [Nominatim](https://nominatim.org), och en träff godtas bara om den ligger i ett län som hör till tävlingens distrikt. Tävlingar som inte kan placeras hamnar mitt i sitt distrikt och märks som ungefärliga – skriptet listar dem när det körs.

**Rätta en plats som hamnar fel** genom att lägga till den i `scripts/platser-manuellt.json`, med platsen exakt som den står i SSF-TA:

```json
{
  "Kaptensgården": { "lat": 67.1756, "lon": 20.6610 }
}
```

Kör sedan `npm run hamta-tavlingar` igen och committa.

## Uppdatera kartdatan

1. **Lantmäteriet, Topografi 1M Nedladdning, vektor** (GeoPackage, CC0). Beställs gratis via [Geotorget](https://geotorget.lantmateriet.se/geodataprodukter) (kräver konto). Lägg de här zip-filerna direkt i `data/` (övriga i beställningen används inte):
   - `mark_sverige.zip`
   - `hydrografi_sverige.zip`
   - `kommunikation_sverige.zip`
   - `administrativindelning_sverige.zip`
2. **Natural Earth** (public domain), för grannländerna. Ladda ner till `data/natural-earth/`:
   - [ne_10m_admin_0_countries.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson)
   - [ne_10m_lakes.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson)
3. Kör `npm run bygg-karta`. Det tar några sekunder och ersätter allt i `public/kartdata/`.

Vilka lager och objekttyper som tas med, och hur långt man kan zooma, ställs in högst upp i `scripts/bygg-karta.mjs`. Bara det som kartan ritar tas med, så om du lägger till ett lager i `public/app.js` måste det också läggas till där. Områdena måste stämma med `bounds` i `public/app.js`.

## Publicera

Sidan publiceras på GitHub Pages vid varje push till `main` och varje natt (se `.github/workflows/pages.yml`). Innan publiceringen hämtas aktuella tävlingar, och om de har ändrats committas de tillbaka till repot. Kartdatan byggs inte där – kör `npm run bygg-karta` och committa `public/kartdata/` om den har ändrats.

## Källor

- Tävlingar: [Svenska Skidförbundet, SSF-TA](https://ssfta.skidor.com)
- Platser: © [OpenStreetMap](https://www.openstreetmap.org/copyright)-bidragsgivare, via Nominatim
- Kartdata Sverige: © Lantmäteriet (CC0)
- Grannländer: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Kartbibliotek: [MapLibre GL JS](https://maplibre.org)
