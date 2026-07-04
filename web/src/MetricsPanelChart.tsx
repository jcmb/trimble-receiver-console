import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReceiverMetricsSample } from "./receiverMetricsHistory";
import {
  defaultEnabledForPanel,
  PANEL_AXIS_UNITS,
  PANEL_TITLES,
  seriesForPanel,
  type MetricsPanelId,
  type MetricsSeriesKey,
  type SeriesDef,
} from "./metricsSeries";
import { useTheme } from "./themeContext";

type TimeDomain = {
  tMin: number;
  tMax: number;
  tSpan: number;
  now: number;
  sorted: ReceiverMetricsSample[];
};

type LegendHit = { key: MetricsSeriesKey; x: number; y: number; w: number; h: number };

type PlotLayout = {
  padL: number;
  padR: number;
  padT: number;
  plotW: number;
  plotH: number;
  plotBottom: number;
  legendY: number;
  cssW: number;
  cssH: number;
};

function shortFixLabel(label: string | undefined, type: number): string {
  const t = (label ?? "").trim();
  if (!t) return String(type);
  if (t.length <= 22) return t;
  return `${t.slice(0, 20)}…`;
}

function yRange(values: number[], integer?: boolean): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (integer) {
    min = Math.floor(min);
    max = Math.ceil(max);
    if (min === max) {
      min -= 1;
      max += 1;
    }
  } else if (min === max) {
    const pad = Math.abs(min) > 1e-6 ? Math.abs(min) * 0.05 : 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

function timeDomain(samples: ReceiverMetricsSample[], frozen?: boolean): TimeDomain | null {
  if (samples.length === 0) return null;
  const sorted = samples.slice().sort((a, b) => a.at - b.at);
  const lastAt = sorted[sorted.length - 1]!.at;
  const now = frozen ? lastAt : Date.now();
  const tMin = sorted[0]!.at;
  const tMax = frozen ? lastAt : Math.max(now, lastAt);
  return { tMin, tMax, tSpan: Math.max(tMax - tMin, 5000), now, sorted };
}

function formatTimeAxis(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function seriesColor(def: SeriesDef, isLight: boolean): string {
  return isLight ? def.colorLight : def.color;
}

function formatAxisTick(v: number, integer?: boolean, span?: number): string {
  if (integer) return String(Math.round(v));
  if (span != null && span < 0.01) return v.toFixed(4);
  if (span != null && span < 0.1) return v.toFixed(3);
  const a = Math.abs(v);
  if (a >= 10000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function collectAxisValues(sorted: ReceiverMetricsSample[], defs: SeriesDef[]): number[] {
  const vals: number[] = [];
  for (const s of sorted) {
    for (const d of defs) {
      if (!d.hasData(s)) continue;
      const v = d.value(s);
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
  }
  return vals;
}

function axisTickLabels(
  range: { min: number; max: number },
  integer?: boolean,
): string[] {
  const span = range.max - range.min;
  const labels: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    const v = range.min + frac * span;
    labels.push(formatAxisTick(v, integer, span));
  }
  return labels;
}

function measureAxisPadding(
  ctx: CanvasRenderingContext2D,
  leftLabels: string[],
  rightLabels: string[],
  leftUnit?: string,
  rightUnit?: string,
): { padL: number; padR: number } {
  ctx.font = "9px system-ui";
  let padL = 44;
  for (const t of leftLabels) {
    padL = Math.max(padL, ctx.measureText(t).width + 14);
  }
  if (leftUnit) {
    ctx.font = "10px system-ui";
    padL += ctx.measureText(leftUnit).width + 16;
  }

  ctx.font = "9px system-ui";
  let padR = 44;
  for (const t of rightLabels) {
    padR = Math.max(padR, ctx.measureText(t).width + 14);
  }
  if (rightUnit) {
    ctx.font = "10px system-ui";
    padR += ctx.measureText(rightUnit).width + 16;
  }

  return { padL: Math.ceil(padL), padR: Math.ceil(padR) };
}

function axisUsesIntegers(defs: SeriesDef[]): boolean {
  return defs.length > 0 && defs.every((d) => d.integerValue);
}

function gridMuted(isLight: boolean): string {
  return isLight ? "#9aa0a6" : "#6b7280";
}

export function MetricsPanelChart({
  panel,
  samples,
  frozen = false,
  paused = false,
  onTogglePause,
}: {
  panel: MetricsPanelId;
  samples: ReceiverMetricsSample[];
  frozen?: boolean;
  paused?: boolean;
  onTogglePause?: () => void;
}) {
  const panelSeries = useMemo(() => seriesForPanel(panel), [panel]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<{ x: number; y: number; sample: ReceiverMetricsSample }[]>([]);
  const legendHitsRef = useRef<LegendHit[]>([]);
  const layoutRef = useRef<PlotLayout | null>(null);
  const dragRef = useRef<{ x0: number; x1: number } | null>(null);
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const [enabled, setEnabled] = useState<Record<MetricsSeriesKey, boolean>>(() =>
    defaultEnabledForPanel(panel),
  );
  const [tip, setTip] = useState<{ px: number; py: number; text: string } | null>(null);
  const [xView, setXView] = useState<{ tMin: number; tMax: number } | null>(null);
  const [dragBox, setDragBox] = useState<{ x0: number; x1: number } | null>(null);
  const [legendHover, setLegendHover] = useState(false);

  const fullDomain = useMemo(() => timeDomain(samples, frozen), [samples, frozen]);

  useEffect(() => {
    setXView(null);
  }, [panel]);

  const available = useMemo(() => {
    const out = new Set<MetricsSeriesKey>();
    for (const s of samples) {
      for (const def of panelSeries) {
        if (def.hasData(s)) out.add(def.key);
      }
    }
    return out;
  }, [samples, panelSeries]);

  const activeSeries = useMemo(
    () =>
      panelSeries.filter((d) => enabled[d.key] && (available.has(d.key) || samples.length === 0)),
    [panelSeries, enabled, available, samples.length],
  );

  const viewWindow = useMemo(() => {
    if (!fullDomain) return null;
    const tMin = xView?.tMin ?? fullDomain.tMin;
    const tMax = xView?.tMax ?? fullDomain.tMax;
    return {
      tMin,
      tMax,
      tSpan: Math.max(tMax - tMin, 1000),
      now: fullDomain.now,
      sorted: fullDomain.sorted,
    };
  }, [fullDomain, xView]);

  const toggle = (key: MetricsSeriesKey) => {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetZoom = () => setXView(null);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `trimble-${panel}-${stamp}.png`;
    a.click();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const chartWrap = canvasWrapRef.current;
    const outer = wrapRef.current;
    if (!canvas || !chartWrap || !outer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cssW = Math.max(280, chartWrap.clientWidth || outer.clientWidth || 380);
    const cssH = Math.max(160, chartWrap.clientHeight || 220);
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

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    let padL = panel === "fixType" ? 148 : 56;
    let padR = 56;
    const padT = 20;
    const xAxisH = 22;

    if (panel !== "fixType" && activeSeries.length > 0 && viewWindow) {
      const leftSeries = activeSeries.filter((d) => seriesAxis(d, panel) === "left");
      const rightSeries = activeSeries.filter((d) => seriesAxis(d, panel) === "right");
      const sorted = viewWindow.sorted;
      const leftVals = collectAxisValues(sorted, leftSeries);
      const rightVals = collectAxisValues(sorted, rightSeries);
      const leftInt = axisUsesIntegers(leftSeries);
      const rightInt = axisUsesIntegers(rightSeries);
      const leftRange = leftVals.length ? yRange(leftVals, leftInt) : null;
      const rightRange = rightVals.length ? yRange(rightVals, rightInt) : null;
      const units = PANEL_AXIS_UNITS[panel];
      const leftLabels = leftRange ? axisTickLabels(leftRange, leftInt) : [];
      const rightLabels = rightRange ? axisTickLabels(rightRange, rightInt) : [];
      const measured = measureAxisPadding(
        ctx,
        leftLabels,
        rightLabels,
        leftSeries.length ? units?.left : undefined,
        rightSeries.length ? units?.right : undefined,
      );
      padL = Math.max(padL, measured.padL);
      padR = Math.max(padR, measured.padR);
    }

    const legendRows =
      panelSeries.length > 1 ? legendRowCount(ctx, panelSeries, padL, cssW) : 0;
    const legendH = legendRows > 0 ? legendRows * 22 + 8 : 8;

    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - xAxisH - legendH - 8;
    const plotBottom = padT + plotH;
    const legendY = plotBottom + xAxisH + 4;

    layoutRef.current = {
      padL,
      padR,
      padT,
      plotW,
      plotH,
      plotBottom,
      legendY,
      cssW,
      cssH,
    };

    hitRef.current = [];
    legendHitsRef.current = [];

    if (!viewWindow) {
      ctx.fillStyle = label;
      ctx.font = "13px system-ui";
      ctx.fillText("No metric samples yet — waiting for GSOF data.", padL, padT + 24);
      return;
    }

    const { tMin, tSpan, now, sorted } = viewWindow;
    const xOf = (t: number) => padL + ((t - tMin) / tSpan) * plotW;

    if (activeSeries.length === 0 && panel !== "fixType") {
      ctx.fillStyle = label;
      ctx.font = "13px system-ui";
      ctx.fillText("Click a series in the legend below to plot.", padL, padT + 24);
      drawLegend(ctx, {
        panelSeries,
        enabled,
        available,
        isLight,
        label,
        legendY,
        padL,
        cssW,
        samplesLength: samples.length,
        legendHits: legendHitsRef.current,
      });
      return;
    }

    if (panel === "fixType") {
      drawFixTypePanel(ctx, {
        sorted,
        xOf,
        now,
        padL,
        plotW,
        plotH,
        padT,
        grid,
        label,
        isLight,
        hits: hitRef.current,
      });
    } else {
      drawNumericPanel(ctx, {
        sorted,
        panelSeries: activeSeries,
        chartPanel: panel,
        xOf,
        padL,
        padR,
        plotW,
        plotH,
        padT,
        cssW,
        grid,
        label,
        isLight,
        hits: hitRef.current,
      });
    }

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    ctx.fillStyle = label;
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const frac = i / 5;
      const t = tMin + frac * tSpan;
      const x = xOf(t);
      ctx.fillText(formatTimeAxis(t), x, plotBottom + 14);
    }
    ctx.textAlign = "left";

    if (dragBox) {
      const x0 = Math.min(dragBox.x0, dragBox.x1);
      const x1 = Math.max(dragBox.x0, dragBox.x1);
      ctx.fillStyle = isLight ? "rgba(25, 103, 210, 0.12)" : "rgba(138, 180, 248, 0.15)";
      ctx.fillRect(x0, padT, x1 - x0, plotH);
      ctx.strokeStyle = isLight ? "#1967d2" : "#8ab4f8";
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, padT, x1 - x0, plotH);
    }

    drawLegend(ctx, {
      panelSeries,
      enabled,
      available,
      isLight,
      label,
      legendY,
      padL,
      cssW,
      samplesLength: samples.length,
      legendHits: legendHitsRef.current,
    });
  }, [samples, isLight, activeSeries, panel, panelSeries, viewWindow, enabled, available, dragBox]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  function canvasCoords(ev: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cssW = parseFloat(canvas.style.width) || rect.width;
    const cssH = parseFloat(canvas.style.height) || rect.height;
    return {
      mx: ((ev.clientX - rect.left) / rect.width) * cssW,
      my: ((ev.clientY - rect.top) / rect.height) * cssH,
    };
  }

  function timeAtX(mx: number): number | null {
    const layout = layoutRef.current;
    const domain = viewWindow;
    if (!layout || !domain) return null;
    const frac = (mx - layout.padL) / layout.plotW;
    if (frac < 0 || frac > 1) return null;
    return domain.tMin + frac * domain.tSpan;
  }

  function onWheel(ev: React.WheelEvent<HTMLCanvasElement>) {
    if (!fullDomain || !viewWindow) return;
    ev.preventDefault();
    const coords = canvasCoords(ev);
    if (!coords) return;
    const centerT = timeAtX(coords.mx) ?? (viewWindow.tMin + viewWindow.tMax) / 2;
    const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
    const fullSpan = Math.max(fullDomain.tMax - fullDomain.tMin, 5000);
    let newSpan = Math.min(fullSpan, Math.max(5000, viewWindow.tSpan * factor));
    let tMin = centerT - (centerT - viewWindow.tMin) * (newSpan / viewWindow.tSpan);
    let tMax = tMin + newSpan;
    if (tMin < fullDomain.tMin) {
      tMin = fullDomain.tMin;
      tMax = tMin + newSpan;
    }
    if (tMax > fullDomain.tMax) {
      tMax = fullDomain.tMax;
      tMin = tMax - newSpan;
    }
    setXView({ tMin, tMax });
  }

  function onMouseDown(ev: React.MouseEvent<HTMLCanvasElement>) {
    const coords = canvasCoords(ev);
    const layout = layoutRef.current;
    if (!coords || !layout) return;

    for (const hit of legendHitsRef.current) {
      if (
        coords.mx >= hit.x &&
        coords.mx <= hit.x + hit.w &&
        coords.my >= hit.y &&
        coords.my <= hit.y + hit.h
      ) {
        toggle(hit.key);
        return;
      }
    }

    if (
      coords.mx >= layout.padL &&
      coords.mx <= layout.padL + layout.plotW &&
      coords.my >= layout.padT &&
      coords.my <= layout.plotBottom
    ) {
      dragRef.current = { x0: coords.mx, x1: coords.mx };
      setDragBox({ x0: coords.mx, x1: coords.mx });
      setTip(null);
    }
  }

  function onMouseMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const coords = canvasCoords(ev);
    if (!coords) return;

    const overLegend = legendHitsRef.current.some(
      (h) =>
        coords.mx >= h.x &&
        coords.mx <= h.x + h.w &&
        coords.my >= h.y &&
        coords.my <= h.y + h.h,
    );
    setLegendHover(overLegend);

    if (dragRef.current) {
      dragRef.current.x1 = coords.mx;
      setDragBox({ x0: dragRef.current.x0, x1: coords.mx });
      return;
    }

    const mx = coords.mx;
    const my = coords.my;
    let best: { x: number; y: number; sample: ReceiverMetricsSample } | null = null;
    let bestD = 14;
    for (const h of hitRef.current) {
      const d = Math.hypot(mx - h.x, my - h.y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best) {
      const s = best.sample;
      const lines = [new Date(s.at).toLocaleString()];
      for (const def of activeSeries) {
        if (!def.hasData(s)) continue;
        const v = def.value(s);
        if (v == null) continue;
        if (def.key === "fixType") {
          lines.push(`${def.label}: ${s.position_type_label ?? ""} (${Math.round(v)})`);
        } else {
          lines.push(`${def.label}: ${def.format(v)}`);
        }
      }
      setTip({ px: ev.clientX + 12, py: ev.clientY + 12, text: lines.join("\n") });
    } else {
      setTip(null);
    }
  }

  function onMouseUp(ev: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragBox(null);
    if (!drag || !fullDomain) return;

    const coords = canvasCoords(ev);
    if (!coords) return;

    const x0 = Math.min(drag.x0, coords.mx);
    const x1 = Math.max(drag.x0, coords.mx);
    if (x1 - x0 < 12) return;

    const t0 = timeAtX(x0);
    const t1 = timeAtX(x1);
    if (t0 == null || t1 == null) return;
    setXView({ tMin: Math.min(t0, t1), tMax: Math.max(t0, t1) });
  }

  const cursor = dragBox ? "crosshair" : legendHover ? "pointer" : "crosshair";

  return (
    <div ref={wrapRef} className="metrics-panel-chart">
      <div className="metrics-chart-toolbar row" style={{ gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        {onTogglePause ? (
          <button
            type="button"
            className={`nav-tab${paused ? " active" : ""}`}
            onClick={onTogglePause}
            title={paused ? "Resume live updates" : "Pause live updates"}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        ) : null}
        <button type="button" className="nav-tab" onClick={downloadPng}>
          Download PNG
        </button>
        <button type="button" className="nav-tab" onClick={resetZoom} disabled={!xView}>
          Reset zoom
        </button>
      </div>
      <div ref={canvasWrapRef} className="metrics-chart-canvas-wrap">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={PANEL_TITLES[panel]}
          style={{ width: "100%", display: "block", cursor }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            dragRef.current = null;
            setDragBox(null);
            setTip(null);
            setLegendHover(false);
          }}
          onDoubleClick={resetZoom}
        />
        {tip && (
          <pre
            className="metrics-chart-tooltip"
            style={{ left: tip.px, top: tip.py }}
          >
            {tip.text}
          </pre>
        )}
      </div>
    </div>
  );
}

function legendItemWidth(ctx: CanvasRenderingContext2D, text: string): number {
  ctx.font = "11px system-ui";
  return 14 + ctx.measureText(text).width + 14;
}

function legendRowCount(
  ctx: CanvasRenderingContext2D,
  panelSeries: SeriesDef[],
  padL: number,
  cssW: number,
): number {
  if (panelSeries.length <= 1) return 0;
  let rows = 1;
  let x = padL;
  for (const def of panelSeries) {
    const w = legendItemWidth(ctx, def.shortLabel);
    if (x + w > cssW - 8) {
      rows++;
      x = padL;
    }
    x += w + 6;
  }
  return rows;
}

function drawLegendSwatch(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    color: string;
    on: boolean;
    isLight: boolean;
    lineDash?: number[];
  },
) {
  const { x, y, color, on, isLight, lineDash } = opts;
  ctx.strokeStyle = on ? color : gridMuted(isLight);
  ctx.fillStyle = on ? color : gridMuted(isLight);
  if (lineDash?.length) {
    ctx.lineWidth = 2;
    ctx.setLineDash(lineDash);
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 10);
    ctx.lineTo(x + 16, y + 10);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillRect(x + 6, y + 9, 10, 3);
  }
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  opts: {
    panelSeries: SeriesDef[];
    enabled: Record<MetricsSeriesKey, boolean>;
    available: Set<MetricsSeriesKey>;
    isLight: boolean;
    label: string;
    legendY: number;
    padL: number;
    cssW: number;
    samplesLength: number;
    legendHits: LegendHit[];
  },
) {
  const { panelSeries, enabled, available, isLight, label, legendY, padL, cssW, samplesLength, legendHits } =
    opts;
  if (panelSeries.length <= 1) return;

  let x = padL;
  let row = 0;
  const rowHeight = 22;
  const y0 = legendY;

  for (const def of panelSeries) {
    const on = enabled[def.key];
    const has = available.has(def.key);
    const color = seriesColor(def, isLight);
    const text = def.shortLabel;
    const w = legendItemWidth(ctx, text);

    if (x + w > cssW - 8) {
      row++;
      x = padL;
    }
    const itemY = y0 + row * rowHeight;

    legendHits.push({ key: def.key, x, y: itemY, w, h: rowHeight });

    if (on) {
      ctx.fillStyle = isLight ? "rgba(25, 103, 210, 0.1)" : "rgba(138, 180, 248, 0.12)";
      ctx.fillRect(x, itemY, w, rowHeight);
    }

    drawLegendSwatch(ctx, { x, y: itemY, color, on, isLight, lineDash: def.lineDash });

    ctx.fillStyle = on ? label : gridMuted(isLight);
    if (!has && samplesLength > 0) {
      ctx.globalAlpha = 0.45;
    }
    ctx.font = "11px system-ui";
    ctx.fillText(text, x + 20, itemY + 14);
    ctx.globalAlpha = 1;

    if (!on) {
      ctx.strokeStyle = gridMuted(isLight);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, itemY + rowHeight / 2);
      ctx.lineTo(x + w - 4, itemY + rowHeight / 2);
      ctx.stroke();
    }

    x += w + 6;
  }
}

function drawFixTypePanel(
  ctx: CanvasRenderingContext2D,
  opts: {
    sorted: ReceiverMetricsSample[];
    xOf: (t: number) => number;
    now: number;
    padL: number;
    plotW: number;
    plotH: number;
    padT: number;
    grid: string;
    label: string;
    isLight: boolean;
    hits: { x: number; y: number; sample: ReceiverMetricsSample }[];
  },
) {
  const { sorted, xOf, now, padL, plotW, plotH, padT, grid, label, hits, isLight } = opts;
  const withType = sorted.filter((s) => s.has_position_type && s.position_type != null);
  if (withType.length === 0) {
    ctx.fillStyle = label;
    ctx.font = "12px system-ui";
    ctx.fillText("No fix type data.", padL, padT + plotH / 2);
    return;
  }

  const types = [...new Set(withType.map((s) => s.position_type!))].sort((a, b) => a - b);
  let yMin = types[0]!;
  let yMax = types[types.length - 1]!;
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yOf = (type: number) => padT + plotH - ((type - yMin) / (yMax - yMin)) * plotH;
  const lineColor = isLight ? "#1967d2" : "#8ab4f8";
  const pointColor = isLight ? "#e37400" : "#fbbc04";

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (const type of types) {
    const y = yOf(type);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = label;
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  for (const type of types) {
    const sample = withType.find((s) => s.position_type === type);
    ctx.fillText(
      `${type} · ${shortFixLabel(sample?.position_type_label, type)}`,
      padL - 8,
      yOf(type) + 3,
    );
  }
  ctx.textAlign = "left";

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const first = withType[0]!;
  let py = yOf(first.position_type!);
  ctx.moveTo(xOf(first.at), py);
  for (let i = 1; i < withType.length; i++) {
    const s = withType[i]!;
    const nx = xOf(s.at);
    const ny = yOf(s.position_type!);
    ctx.lineTo(nx, py);
    ctx.lineTo(nx, ny);
    py = ny;
  }
  ctx.lineTo(xOf(now), py);
  ctx.stroke();

  for (const s of withType) {
    const x = xOf(s.at);
    const y = yOf(s.position_type!);
    hits.push({ x, y, sample: s });
    ctx.fillStyle = pointColor;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function seriesAxis(def: SeriesDef, chartPanel: MetricsPanelId): "left" | "right" {
  if (chartPanel === "llh") {
    if (def.key === "height") return "left";
    if (def.key === "sigmaU") return "right";
  }
  return def.axis;
}

function drawNumericPanel(
  ctx: CanvasRenderingContext2D,
  opts: {
    sorted: ReceiverMetricsSample[];
    panelSeries: SeriesDef[];
    chartPanel: MetricsPanelId;
    xOf: (t: number) => number;
    padL: number;
    padR: number;
    plotW: number;
    plotH: number;
    padT: number;
    cssW: number;
    grid: string;
    label: string;
    isLight: boolean;
    hits: { x: number; y: number; sample: ReceiverMetricsSample }[];
  },
) {
  const {
    sorted,
    panelSeries,
    chartPanel,
    xOf,
    padL,
    plotW,
    plotH,
    padT,
    cssW,
    grid,
    label,
    isLight,
    hits,
  } = opts;

  const leftSeries = panelSeries.filter((d) => seriesAxis(d, chartPanel) === "left");
  const rightSeries = panelSeries.filter((d) => seriesAxis(d, chartPanel) === "right");

  const leftVals = collectAxisValues(sorted, leftSeries);
  const rightVals = collectAxisValues(sorted, rightSeries);
  if (leftVals.length === 0 && rightVals.length === 0) {
    ctx.fillStyle = label;
    ctx.font = "12px system-ui";
    ctx.fillText("No data for selected series.", padL, padT + plotH / 2);
    return;
  }

  const leftInt = axisUsesIntegers(leftSeries);
  const rightInt = axisUsesIntegers(rightSeries);
  const leftRange =
    leftVals.length > 0
      ? yRange(leftVals, leftInt)
      : rightVals.length > 0
        ? yRange(rightVals, rightInt)
        : { min: 0, max: 1 };
  const rightRange =
    rightVals.length > 0
      ? yRange(rightVals, rightInt)
      : leftVals.length > 0
        ? yRange(leftVals, leftInt)
        : { min: 0, max: 1 };

  const yLeft = (v: number) =>
    padT + plotH - ((v - leftRange.min) / (leftRange.max - leftRange.min)) * plotH;
  const yRight = (v: number) =>
    padT + plotH - ((v - rightRange.min) / (rightRange.max - rightRange.min)) * plotH;

  const units = PANEL_AXIS_UNITS[chartPanel];

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    const y = padT + plotH - frac * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = label;
  ctx.font = "9px system-ui";

  if (leftSeries.length > 0) {
    const span = leftRange.max - leftRange.min;
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const v = leftRange.min + frac * span;
      const y = padT + plotH - frac * plotH;
      ctx.fillText(formatAxisTick(v, leftInt, span), padL - 6, y + 3);
    }
    if (units?.left) {
      ctx.save();
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.translate(12, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(units.left, 0, 0);
      ctx.restore();
    }
  }

  if (rightSeries.length > 0) {
    const span = rightRange.max - rightRange.min;
    ctx.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const v = rightRange.min + frac * span;
      const y = padT + plotH - frac * plotH;
      ctx.fillText(formatAxisTick(v, rightInt, span), padL + plotW + 6, y + 3);
    }
    if (units?.right) {
      ctx.save();
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.translate(cssW - 12, padT + plotH / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(units.right, 0, 0);
      ctx.restore();
    }
  }
  ctx.textAlign = "left";

  for (const def of panelSeries) {
    const color = seriesColor(def, isLight);
    const yFn = seriesAxis(def, chartPanel) === "right" ? yRight : yLeft;
    const points: { x: number; y: number; s: ReceiverMetricsSample }[] = [];
    for (const s of sorted) {
      if (!def.hasData(s)) continue;
      const v = def.value(s);
      if (v == null || !Number.isFinite(v)) continue;
      points.push({ x: xOf(s.at), y: yFn(v), s });
    }
    if (points.length === 0) continue;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.setLineDash(def.lineDash ?? []);
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const p of points) {
      hits.push({ x: p.x, y: p.y, sample: p.s });
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
