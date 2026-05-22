import type { StyleSpecification } from "maplibre-gl";

/**
 * Keep the style local so route overlays can render even when the remote
 * vector style JSON, glyphs, or sprites are slow/unavailable. Raster tiles
 * may still fail offline, but MapLibre reaches "load" and flight geometry
 * remains visible over the dark background.
 */
export const ALOFT_DARK_MAP_STYLE: StyleSpecification = {
  version: 8,
  // Declare the projection in the style itself — calling setProjection()
  // at runtime against a raster-only style sometimes no-ops before the
  // style finishes parsing. Declaring here makes the globe render from
  // the first frame.
  projection: { type: "globe" },
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0A0B0D",
      },
    },
    {
      id: "carto-dark",
      type: "raster",
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 20,
      paint: {
        "raster-opacity": 0.88,
        "raster-fade-duration": 120,
      },
    },
  ],
};
