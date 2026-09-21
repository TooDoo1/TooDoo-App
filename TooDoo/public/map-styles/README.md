# TooDoo maps = MapLibre basemap + own UI layer

```
OpenStreetMap data ──► MapLibre / OpenFreeMap
                              │
                              ▼
                        TooDoo design
                   ┌──────────┴──────────┐
                   ▼                     ▼
            Företagspins            Företagskort
            Kategorifärger          Erbjudanden / tap
```

## Web
- `components/ui/maplibre-map.web.tsx` — MapLibre from CDN in a real DOM node
- Pins, cards, navigation are TooDoo code on top of the style

## Native
- `react-native-maps` + Carto raster tiles (same pins/data)
- MapLibre Native later if you want identical vector styling

## Customize basemap colors
1. Open [Maputnik](https://maputnik.github.io/)
2. Load `https://tiles.openfreemap.org/styles/liberty`
3. Edit paints → Export JSON → save as `toodoo-dark.json` / `toodoo-light.json` here
4. Point `mapLibreStyleUrlForMode` at those files

Keep OpenFreeMap `sources` / `sprite` / `glyphs` URLs. Attribution is required.
