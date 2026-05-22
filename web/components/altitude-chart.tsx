"use client";

import * as React from "react";
import Plotly from "plotly.js-basic-dist-min";

export type ChartWaypoint = {
  t: number;     // epoch seconds
  alt_m: number | null;
  lat: number;
  lon: number;
};

type Props = {
  waypoints: ChartWaypoint[];
  /** Highlight bands where the duration exceeds threshold seconds. */
  gaps?: { start: number; end: number }[];
};

/**
 * Altitude (left axis) + speed (right axis) over time.
 *
 * Speed isn't stored per waypoint — we derive it from consecutive segments
 * via haversine. With the OpenSky /tracks/all spacing this gives a noisy
 * but readable cruise/climb/descent profile.
 *
 * The chart is intentionally minimal: no toolbar, no zoom UI, no axis
 * fluff. The container's parent controls sizing.
 */
export function AltitudeChart({ waypoints, gaps = [] }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (waypoints.length < 2) {
      el.innerHTML = `<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#8B9099;font-size:14px;">No ADS-B waypoints to plot.</div>`;
      return () => {};
    }

    const t0 = waypoints[0].t;
    const minutes = waypoints.map((w) => (w.t - t0) / 60);
    const altitudesFt = waypoints.map((w) =>
      w.alt_m === null ? null : w.alt_m * 3.28084,
    );
    const speedsKt = computeSpeedsKt(waypoints);

    const gapShapes = gaps.map((g) => ({
      type: "rect" as const,
      xref: "x" as const,
      yref: "paper" as const,
      x0: (g.start - t0) / 60,
      x1: (g.end - t0) / 60,
      y0: 0,
      y1: 1,
      fillcolor: "rgba(232,165,71,0.10)",
      line: { width: 0 },
    }));

    Plotly.newPlot(
      el,
      [
        {
          x: minutes,
          y: altitudesFt,
          type: "scatter",
          mode: "lines",
          name: "Altitude (ft)",
          line: { color: "#00D4FF", width: 2 },
          yaxis: "y",
          connectgaps: false,
        },
        {
          x: minutes,
          y: speedsKt,
          type: "scatter",
          mode: "lines",
          name: "Ground speed (kt)",
          line: { color: "#4ADE80", width: 1.2, dash: "dot" },
          yaxis: "y2",
          connectgaps: false,
        },
      ],
      {
        autosize: true,
        margin: { l: 50, r: 50, t: 12, b: 36 },
        paper_bgcolor: "#13151A",
        plot_bgcolor: "#13151A",
        font: { color: "#E8EAED", family: "JetBrains Mono, monospace", size: 11 },
        showlegend: false,
        xaxis: {
          title: { text: "minutes elapsed", standoff: 6 },
          gridcolor: "#1F2228",
          zeroline: false,
          tickfont: { size: 10, color: "#8B9099" },
        },
        yaxis: {
          title: { text: "altitude · ft", standoff: 6 },
          gridcolor: "#1F2228",
          zeroline: false,
          tickfont: { size: 10, color: "#00D4FF" },
          rangemode: "tozero",
        },
        yaxis2: {
          title: { text: "speed · kt", standoff: 6 },
          overlaying: "y",
          side: "right",
          gridcolor: "transparent",
          zeroline: false,
          tickfont: { size: 10, color: "#4ADE80" },
          rangemode: "tozero",
        },
        shapes: gapShapes,
        hovermode: "x unified",
      },
      {
        displayModeBar: false,
        responsive: true,
        scrollZoom: false,
      },
    );

    return () => {
      Plotly.purge(el);
    };
  }, [waypoints, gaps]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function computeSpeedsKt(waypoints: ChartWaypoint[]): (number | null)[] {
  // First point has no preceding segment — leave it null so Plotly draws a
  // line starting at the second sample. Speeds are smoothed with a 3-pt
  // moving average to take the edge off OpenSky's sometimes-jittery /tracks
  // data.
  const raw: (number | null)[] = [null];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const dt = Math.max(1, b.t - a.t);
    const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const kt = (km * 1000) / dt / 0.514444;
    raw.push(kt);
  }
  // 3-point moving average.
  return raw.map((v, i) => {
    if (v === null) return null;
    const prev = raw[i - 1];
    const next = raw[i + 1];
    const values = [v, prev, next].filter((x): x is number => x !== null);
    return values.reduce((s, x) => s + x, 0) / values.length;
  });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlam = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
