# Tävlingskarta längdskidor

En enkel webbsida med en karta över Sverige.

## Struktur

- `public/` – själva webbplatsen. Det är bara den här mappen som ska publiceras.
  - `index.html` – sidan och kartans stil (MapLibre GL).
  - `kartdata/` – färdiga vektortiles, byggda av `npm run bygg-karta`. Ligger i git så att sidan kan publiceras utan byggsteg.
- `scripts/bygg-karta.mjs` – gör om rådatan i `data/` till tiles i `public/kartdata/`.
- `data/` – rådata. Ligger inte i git, se nedan hur den laddas ner.

## Köra lokalt

```
npm install
npm start
```

Öppna adressen som skrivs ut (oftast http://localhost:3000). Sidan fungerar inte om man öppnar `index.html` direkt från disken, eftersom webbläsaren då inte får hämta kartdatan.

## Uppdatera kartdatan

1. **Lantmäteriet, Topografi 1M Nedladdning, vektor** (GeoPackage, CC0). Beställs gratis via [Geotorget](https://geotorget.lantmateriet.se/geodataprodukter) (kräver konto). Lägg alla zip-filer (`mark_sverige.zip`, `hydrografi_sverige.zip` osv.) direkt i `data/`.
2. **Natural Earth** (public domain), för grannländerna. Ladda ner till `data/natural-earth/`:
   - [ne_10m_admin_0_countries.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson)
   - [ne_10m_lakes.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson)
3. Kör `npm run bygg-karta`. Det tar några sekunder och ersätter allt i `public/kartdata/`.

Vilka lager som tas med, och hur långt man kan zooma, ställs in högst upp i `scripts/bygg-karta.mjs`. Områdena där måste stämma med `bounds` i `public/index.html`.

## Publicera

Publicera mappen `public/` som en statisk webbplats, t.ex. på Cloudflare Pages (utan byggkommando, med `public` som utdatamapp).

## Källor

- Kartdata Sverige: © Lantmäteriet (CC0)
- Grannländer: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Kartbibliotek: [MapLibre GL JS](https://maplibre.org)
