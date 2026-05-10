import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SVInfo } from "./types";
import { useTheme } from "./themeContext";
import {
  SV_SYSTEM_NAMES,
  sysIndex,
  svTooltipText,
  trackedSatellitesForSky,
} from "./svSkyShared";

const SAT_COLORS_DARK = [
  "#8ab4f8",
  "#fbbc04",
  "#26c6da", // GLONASS — teal (distinct from MSS)
  "#c58af9",
  "#ff8a65",
  "#4dd0e1",
  "#f48fb1",
  "#ff5252", // MSS — red (was yellow-green; contrast with GLONASS)
  "#78909c",
];
const SAT_COLORS_LIGHT = [
  "#1967d2",
  "#e37400",
  "#2e7d32", // GLONASS — forest green
  "#8430ce",
  "#c5221f",
  "#007b83",
  "#ad1457",
  "#6a1b9a", // MSS — deep purple (distinct from GLONASS green)
  "#455a64",
];

type Hit = { x: number; y: number; sv: SVInfo };

function ptOnSkyplot(
  cx: number,
  cy: number,
  rMax: number,
  elDeg: number,
  azDeg: number
): { x: number; y: number } {
  const el = Math.max(0, Math.min(90, elDeg));
  const az = ((azDeg % 360) + 360) % 360;
  const r = rMax * (1 - el / 90);
  const rad = (az * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

export function SkyPlot({ svs }: { svs: SVInfo[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<Hit[]>([]);
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const colors = isLight ? SAT_COLORS_LIGHT : SAT_COLORS_DARK;

  const systemsWithTracked = useMemo(() => {
    const set = new Set<number>();
    for (const sv of trackedSatellitesForSky(svs)) {
      set.add(sysIndex(sv));
    }
    return set;
  }, [svs]);

  const [visibleSys, setVisibleSys] = useState<boolean[]>(() => Array(SV_SYSTEM_NAMES.length).fill(true));
  const [tip, setTip] = useState<{ px: number; py: number; text: string } | null>(null);

  const plotInput = useMemo(() => {
    const out: SVInfo[] = [];
    for (const sv of svs) {
      if (sv.elevation_deg <= 0 && sv.azimuth_deg <= 0 && !sv.used_in_position) {
        continue;
      }
      if (!visibleSys[sysIndex(sv)]) {
        continue;
      }
      out.push(sv);
    }
    return out;
  }, [svs, visibleSys]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const wPx = wrap.clientWidth || 420;
    const cssW = Math.min(520, Math.max(220, wPx));
    const cssH = cssW;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const bg =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-canvas-bg").trim() ||
      "#0f1115";
    const grid =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-grid").trim() || "#2a2f3a";
    const label =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-label").trim() || "#9aa0a6";
    const prnText =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-prn").trim() || "#e8eaed";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const pad = 16;
    const cx = cssW / 2;
    const cy = cssH / 2;
    const rMax = Math.min(cx, cy) - pad - 18;
    if (rMax < 40) {
      hitRef.current = [];
      return;
    }

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let el = 0; el <= 90; el += 30) {
      const radius = rMax * (1 - el / 90);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - rMax, cy);
    ctx.lineTo(cx + rMax, cy);
    ctx.moveTo(cx, cy - rMax);
    ctx.lineTo(cx, cy + rMax);
    ctx.stroke();

    ctx.fillStyle = label;
    ctx.font = "12px system-ui";
    ctx.fillText("N", cx - 4, cy - rMax - 4);
    ctx.fillText("E", cx + rMax + 4, cy + 4);

    const hits: Hit[] = [];
    const sorted = plotInput.slice().sort((a, b) => a.elevation_deg - b.elevation_deg);
    for (const sv of sorted) {
      const { x, y } = ptOnSkyplot(cx, cy, rMax, sv.elevation_deg, sv.azimuth_deg);
      hits.push({ x, y, sv });
      const col = colors[sysIndex(sv)]!;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, sv.used_in_position ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = prnText;
      ctx.font = "10px monospace";
      ctx.fillText(String(sv.prn), x + 7, y - 4);
    }
    hitRef.current = hits;
  }, [plotInput, colors]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") {
      return;
    }
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  function pickHit(mx: number, my: number): Hit | null {
    let best: Hit | null = null;
    let bestD = 20;
    for (const h of hitRef.current) {
      const d = Math.hypot(mx - h.x, my - h.y);
      if (d <= 18 && d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  function onCanvasMouseMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const cssW = parseFloat(canvas.style.width) || rect.width;
    const cssH = parseFloat(canvas.style.height) || rect.height;
    if (rect.width <= 0 || rect.height <= 0) {
      setTip(null);
      return;
    }
    const mx = ((ev.clientX - rect.left) / rect.width) * cssW;
    const my = ((ev.clientY - rect.top) / rect.height) * cssH;
    const hit = pickHit(mx, my);
    if (hit) {
      let x = ev.clientX + 14;
      let y = ev.clientY + 14;
      const tw = 280;
      const th = 120;
      if (x + tw > window.innerWidth - 8) {
        x = ev.clientX - tw - 14;
      }
      if (y + th > window.innerHeight - 8) {
        y = ev.clientY - th - 14;
      }
      setTip({ px: x, py: y, text: svTooltipText(hit.sv) });
    } else {
      setTip(null);
    }
  }

  const showLegend = systemsWithTracked.size > 0;

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      {showLegend && (
        <div className="row" style={{ flexWrap: "wrap", gap: "6px 14px", marginBottom: 10 }}>
          {SV_SYSTEM_NAMES.map((name, i) => {
            if (!systemsWithTracked.has(i)) {
              return null;
            }
            return (
              <label key={name} className="row" style={{ gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={visibleSys[i] ?? true}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setVisibleSys((prev) => {
                      const next = [...prev];
                      next[i] = on;
                      return next;
                    });
                  }}
                />
                <span style={{ color: colors[i], fontSize: 14, lineHeight: 1 }} aria-hidden>
                  ■
                </span>
                <span>{name}</span>
              </label>
            );
          })}
        </div>
      )}
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Satellite sky plot"
          style={{ maxWidth: "100%", display: "block", cursor: "crosshair" }}
          onMouseMove={onCanvasMouseMove}
          onMouseLeave={() => setTip(null)}
        />
        {tip && (
          <pre
            style={{
              position: "fixed",
              left: tip.px,
              top: tip.py,
              margin: 0,
              zIndex: 50,
              pointerEvents: "none",
              whiteSpace: "pre-wrap",
              maxWidth: 280,
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.35,
              fontFamily: "system-ui, sans-serif",
              background: "var(--app-panel, #1e2329)",
              color: "var(--app-text, #e8eaed)",
              border: "1px solid var(--app-border, #3c444d)",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
            }}
          >
            {tip.text}
          </pre>
        )}
      </div>
    </div>
  );
}
