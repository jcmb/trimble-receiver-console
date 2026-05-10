import { useEffect, useRef } from "react";
import type { SVInfo } from "./types";
import { useTheme } from "./themeContext";

const SYS = ["GPS", "SBAS", "GLO", "Gal", "QZSS", "BDS"];

const SAT_COLORS_DARK = ["#8ab4f8", "#fbbc04", "#81c995", "#c58af9", "#ff8a65", "#4dd0e1"];
const SAT_COLORS_LIGHT = ["#1967d2", "#e37400", "#137333", "#8430ce", "#c5221f", "#007b83"];

export function SkyPlot({ svs }: { svs: SVInfo[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const isLight = resolvedTheme === "light";
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--sky-canvas-bg").trim() || "#0f1115";
    const grid =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-grid").trim() || "#2a2f3a";
    const label =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-label").trim() || "#9aa0a6";
    const prnText =
      getComputedStyle(document.documentElement).getPropertyValue("--sky-prn").trim() || "#e8eaed";
    const colors = isLight ? SAT_COLORS_LIGHT : SAT_COLORS_DARK;

    const w = c.width;
    const h = c.height;
    const cx = w / 2;
    const cy = h / 2;
    const rMax = Math.min(w, h) / 2 - 16;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

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

    for (const sv of svs) {
      if (sv.elevation_deg <= 0 && sv.azimuth_deg <= 0 && !sv.used_in_position) continue;
      const el = Math.max(0, Math.min(90, sv.elevation_deg));
      const az = ((sv.azimuth_deg % 360) + 360) % 360;
      const rad = rMax * (1 - el / 90);
      const th = ((90 - az) * Math.PI) / 180;
      const x = cx + rad * Math.cos(th);
      const y = cy - rad * Math.sin(th);
      ctx.fillStyle = colors[sv.system % colors.length]!;
      ctx.beginPath();
      ctx.arc(x, y, sv.used_in_position ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = prnText;
      ctx.font = "10px monospace";
      ctx.fillText(String(sv.prn), x + 6, y - 6);
    }

    let ly = 16;
    SYS.forEach((name, i) => {
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.fillRect(8, ly, 10, 10);
      ctx.fillStyle = label;
      ctx.fillText(name, 22, ly + 9);
      ly += 16;
    });
  }, [svs, resolvedTheme]);

  return <canvas ref={ref} width={420} height={420} style={{ maxWidth: "100%" }} />;
}
