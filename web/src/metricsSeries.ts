import type { ReceiverMetricsSample } from "./receiverMetricsHistory";

export type MetricsSeriesKey =
  | "fixType"
  | "height"
  | "sigmaE"
  | "sigmaN"
  | "sigmaU"
  | "rms"
  | "pdop"
  | "hdop"
  | "vdop"
  | "tdop"
  | "velH"
  | "velV"
  | "heading"
  | "commonL1"
  | "commonL2"
  | "diffSvs"
  | "rtkAge"
  | "linkIntegrity"
  | "svGpsUsed"
  | "svGpsTracked"
  | "svGloUsed"
  | "svGloTracked"
  | "svGalUsed"
  | "svGalTracked"
  | "svBdsUsed"
  | "svBdsTracked"
  | "svQzssUsed"
  | "svQzssTracked"
  | "svSbasUsed"
  | "svSbasTracked"
  | "svNavicUsed"
  | "svNavicTracked";

export type MetricsPanelId =
  | "fixType"
  | "llh"
  | "sigma"
  | "dop"
  | "velocity"
  | "vector"
  | "sv";

export type SeriesDef = {
  key: MetricsSeriesKey;
  label: string;
  shortLabel: string;
  color: string;
  colorLight: string;
  value: (s: ReceiverMetricsSample) => number | undefined;
  hasData: (s: ReceiverMetricsSample) => boolean;
  format: (v: number) => string;
  panel: MetricsPanelId;
  axis: "left" | "right";
  /** Also plot this series on additional graph panels (e.g. σ Up on height graph). */
  alsoOn?: MetricsPanelId[];
  /** Y-axis and tooltips use whole numbers (SV counts, etc.). */
  integerValue?: boolean;
  /** Canvas stroke dash pattern (e.g. tracked SV series). */
  lineDash?: number[];
};

export const MAIN_GRAPH_PANELS: MetricsPanelId[] = ["fixType", "llh", "sigma", "dop", "velocity"];

export const PANEL_TITLES: Record<MetricsPanelId, string> = {
  fixType: "Fix type (GSOF 0x26)",
  llh: "Height & σ Up",
  sigma: "Sigmas & RMS",
  dop: "DOP",
  velocity: "Velocity",
  vector: "Vector diagnostics (GSOF 0x28)",
  sv: "SV Information",
};

/** Y-axis unit captions shown beside numeric panels (left / right scale). */
export const PANEL_AXIS_UNITS: Partial<
  Record<MetricsPanelId, { left?: string; right?: string }>
> = {
  llh: { left: "m", right: "m" },
  sigma: { left: "m" },
  velocity: { left: "m/s", right: "°" },
  sv: { left: "SVs" },
};

export const PANEL_LINK_LABELS: Record<MetricsPanelId, string> = {
  fixType: "Fix type",
  llh: "Height",
  sigma: "Sigma & RMS",
  dop: "DOP",
  velocity: "Velocity",
  vector: "Vector",
  sv: "SV Information",
};

const SV_CONSTELLATIONS: {
  keyUsed: MetricsSeriesKey;
  keyTracked: MetricsSeriesKey;
  system: string;
  short: string;
  usedColor: string;
  usedColorLight: string;
  trackedColor: string;
  trackedColorLight: string;
}[] = [
  {
    keyUsed: "svGpsUsed",
    keyTracked: "svGpsTracked",
    system: "GPS",
    short: "GPS",
    usedColor: "#8ab4f8",
    usedColorLight: "#1967d2",
    trackedColor: "#aecbfa",
    trackedColorLight: "#1a73e8",
  },
  {
    keyUsed: "svGloUsed",
    keyTracked: "svGloTracked",
    system: "GLONASS",
    short: "GLO",
    usedColor: "#81c995",
    usedColorLight: "#188038",
    trackedColor: "#b7e1cd",
    trackedColorLight: "#34a853",
  },
  {
    keyUsed: "svGalUsed",
    keyTracked: "svGalTracked",
    system: "Galileo",
    short: "GAL",
    usedColor: "#f28b82",
    usedColorLight: "#c5221f",
    trackedColor: "#f6aea9",
    trackedColorLight: "#ea4335",
  },
  {
    keyUsed: "svBdsUsed",
    keyTracked: "svBdsTracked",
    system: "BeiDou",
    short: "BDS",
    usedColor: "#fdd663",
    usedColorLight: "#e37400",
    trackedColor: "#fee8a3",
    trackedColorLight: "#f9ab00",
  },
  {
    keyUsed: "svQzssUsed",
    keyTracked: "svQzssTracked",
    system: "QZSS",
    short: "QZS",
    usedColor: "#78d9ec",
    usedColorLight: "#007b83",
    trackedColor: "#a8e4f0",
    trackedColorLight: "#12b5cb",
  },
  {
    keyUsed: "svSbasUsed",
    keyTracked: "svSbasTracked",
    system: "SBAS",
    short: "SBA",
    usedColor: "#d7aefb",
    usedColorLight: "#8430ce",
    trackedColor: "#e9d2fd",
    trackedColorLight: "#a142f4",
  },
  {
    keyUsed: "svNavicUsed",
    keyTracked: "svNavicTracked",
    system: "NavIC",
    short: "NAV",
    usedColor: "#fdcfe8",
    usedColorLight: "#9334e6",
    trackedColor: "#fde7f3",
    trackedColorLight: "#af5cf7",
  },
];

function svConstellationVisible(s: ReceiverMetricsSample, system: string): boolean {
  if (!s.has_sv_info) return false;
  const used = s.sv_used_by_system;
  const tracked = s.sv_tracked_by_system;
  return (
    (used != null && Object.prototype.hasOwnProperty.call(used, system)) ||
    (tracked != null && Object.prototype.hasOwnProperty.call(tracked, system))
  );
}

function svConstellationSeries(): SeriesDef[] {
  const out: SeriesDef[] = [];
  for (const c of SV_CONSTELLATIONS) {
    out.push({
      key: c.keyUsed,
      label: `${c.system} used`,
      shortLabel: `${c.system} used`,
      color: c.usedColor,
      colorLight: c.usedColorLight,
      value: (s) => s.sv_used_by_system?.[c.system] ?? 0,
      hasData: (s) => svConstellationVisible(s, c.system),
      format: (v) => String(Math.round(v)),
      panel: "sv",
      axis: "left",
      integerValue: true,
    });
    out.push({
      key: c.keyTracked,
      label: `${c.system} tracked`,
      shortLabel: `${c.system} tracked`,
      color: c.trackedColor,
      colorLight: c.trackedColorLight,
      value: (s) => s.sv_tracked_by_system?.[c.system] ?? 0,
      hasData: (s) => svConstellationVisible(s, c.system),
      format: (v) => String(Math.round(v)),
      panel: "sv",
      axis: "left",
      integerValue: true,
      lineDash: [6, 4],
    });
  }
  return out;
}

export const METRICS_SERIES: SeriesDef[] = [
  {
    key: "fixType",
    label: "Fix type",
    shortLabel: "Type",
    color: "#8ab4f8",
    colorLight: "#1967d2",
    value: (s) => s.position_type,
    hasData: (s) => s.has_position_type,
    format: (v) => String(Math.round(v)),
    panel: "fixType",
    axis: "left",
    integerValue: true,
  },
  {
    key: "height",
    label: "Height",
    shortLabel: "H",
    color: "#81c995",
    colorLight: "#188038",
    value: (s) => s.height_m,
    hasData: (s) => s.has_llh && s.height_m != null,
    format: (v) => `${v.toFixed(3)} m`,
    panel: "llh",
    axis: "left",
  },
  {
    key: "sigmaE",
    label: "σ East",
    shortLabel: "σE",
    color: "#78d9ec",
    colorLight: "#007b83",
    value: (s) => s.sigma_east_m,
    hasData: (s) => s.has_sigma && s.sigma_east_m != null,
    format: (v) => `${v.toFixed(3)} m`,
    panel: "sigma",
    axis: "left",
  },
  {
    key: "sigmaN",
    label: "σ North",
    shortLabel: "σN",
    color: "#aecbfa",
    colorLight: "#1a73e8",
    value: (s) => s.sigma_north_m,
    hasData: (s) => s.has_sigma && s.sigma_north_m != null,
    format: (v) => `${v.toFixed(3)} m`,
    panel: "sigma",
    axis: "left",
  },
  {
    key: "sigmaU",
    label: "σ Up",
    shortLabel: "σU",
    color: "#d7aefb",
    colorLight: "#8430ce",
    value: (s) => s.sigma_up_m,
    hasData: (s) => s.has_sigma && s.sigma_up_m != null,
    format: (v) => `${v.toFixed(3)} m`,
    panel: "sigma",
    axis: "left",
    alsoOn: ["llh"],
  },
  {
    key: "rms",
    label: "Position RMS",
    shortLabel: "RMS",
    color: "#fdd663",
    colorLight: "#e37400",
    value: (s) => s.position_rms_m,
    hasData: (s) => s.has_sigma && s.position_rms_m != null,
    format: (v) => `${v.toFixed(3)} m`,
    panel: "sigma",
    axis: "left",
  },
  {
    key: "pdop",
    label: "PDOP",
    shortLabel: "PDOP",
    color: "#8ab4f8",
    colorLight: "#1967d2",
    value: (s) => s.pdop,
    hasData: (s) => s.has_dop && s.pdop != null,
    format: (v) => v.toFixed(2),
    panel: "dop",
    axis: "left",
  },
  {
    key: "hdop",
    label: "HDOP",
    shortLabel: "HDOP",
    color: "#81c995",
    colorLight: "#188038",
    value: (s) => s.hdop,
    hasData: (s) => s.has_dop && s.hdop != null,
    format: (v) => v.toFixed(2),
    panel: "dop",
    axis: "left",
  },
  {
    key: "vdop",
    label: "VDOP",
    shortLabel: "VDOP",
    color: "#f28b82",
    colorLight: "#c5221f",
    value: (s) => s.vdop,
    hasData: (s) => s.has_dop && s.vdop != null,
    format: (v) => v.toFixed(2),
    panel: "dop",
    axis: "left",
  },
  {
    key: "tdop",
    label: "TDOP",
    shortLabel: "TDOP",
    color: "#fdcfe8",
    colorLight: "#9334e6",
    value: (s) => s.tdop,
    hasData: (s) => s.has_dop && s.tdop != null,
    format: (v) => v.toFixed(2),
    panel: "dop",
    axis: "left",
  },
  {
    key: "velH",
    label: "Horiz velocity",
    shortLabel: "Vh",
    color: "#78d9ec",
    colorLight: "#007b83",
    value: (s) => s.horizontal_vel_ms,
    hasData: (s) => s.has_velocity && s.horizontal_vel_ms != null,
    format: (v) => `${v.toFixed(3)} m/s`,
    panel: "velocity",
    axis: "left",
  },
  {
    key: "velV",
    label: "Vert velocity",
    shortLabel: "Vv",
    color: "#aecbfa",
    colorLight: "#1a73e8",
    value: (s) => s.vertical_vel_ms,
    hasData: (s) => s.has_velocity && s.vertical_vel_ms != null,
    format: (v) => `${v.toFixed(3)} m/s`,
    panel: "velocity",
    axis: "left",
  },
  {
    key: "heading",
    label: "Heading",
    shortLabel: "Hdg",
    color: "#fdd663",
    colorLight: "#e37400",
    value: (s) => s.heading_deg,
    hasData: (s) => s.has_velocity && s.heading_deg != null,
    format: (v) => `${v.toFixed(2)}°`,
    panel: "velocity",
    axis: "right",
  },
  {
    key: "commonL1",
    label: "Common L1 SVs",
    shortLabel: "L1",
    color: "#81c995",
    colorLight: "#188038",
    value: (s) => s.common_l1_svs,
    hasData: (s) => s.has_vector && s.common_l1_svs != null,
    format: (v) => String(Math.round(v)),
    panel: "vector",
    axis: "left",
    integerValue: true,
  },
  {
    key: "commonL2",
    label: "Common L2 SVs",
    shortLabel: "L2",
    color: "#f28b82",
    colorLight: "#c5221f",
    value: (s) => s.common_l2_svs,
    hasData: (s) => s.has_vector && s.common_l2_svs != null,
    format: (v) => String(Math.round(v)),
    panel: "vector",
    axis: "left",
    integerValue: true,
  },
  {
    key: "diffSvs",
    label: "Diff SVs in use",
    shortLabel: "Diff",
    color: "#aecbfa",
    colorLight: "#1a73e8",
    value: (s) => s.diff_svs_in_use,
    hasData: (s) => s.has_vector && s.diff_svs_in_use != null,
    format: (v) => String(Math.round(v)),
    panel: "vector",
    axis: "left",
    integerValue: true,
  },
  {
    key: "rtkAge",
    label: "RTK position age",
    shortLabel: "Age",
    color: "#fdd663",
    colorLight: "#e37400",
    value: (s) => s.rtk_position_age,
    hasData: (s) => s.has_vector && s.rtk_position_age != null,
    format: (v) => `${v.toFixed(2)} s`,
    panel: "vector",
    axis: "right",
  },
  {
    key: "linkIntegrity",
    label: "Link integrity",
    shortLabel: "Link",
    color: "#d7aefb",
    colorLight: "#8430ce",
    value: (s) => s.link_integrity_pct,
    hasData: (s) => s.has_vector && s.link_integrity_pct != null,
    format: (v) => `${v.toFixed(1)}%`,
    panel: "vector",
    axis: "right",
  },
  ...svConstellationSeries(),
];

export function isMetricsPanelId(value: string): value is MetricsPanelId {
  return (
    value === "fixType" ||
    value === "llh" ||
    value === "sigma" ||
    value === "dop" ||
    value === "velocity" ||
    value === "vector" ||
    value === "sv"
  );
}

export function seriesOnPanel(def: SeriesDef, panel: MetricsPanelId): boolean {
  return def.panel === panel || (def.alsoOn?.includes(panel) ?? false);
}

export function seriesForPanel(panel: MetricsPanelId): SeriesDef[] {
  return METRICS_SERIES.filter((d) => seriesOnPanel(d, panel));
}

export function defaultEnabledForPanel(panel: MetricsPanelId): Record<MetricsSeriesKey, boolean> {
  const out = {} as Record<MetricsSeriesKey, boolean>;
  for (const def of METRICS_SERIES) {
    let on = seriesOnPanel(def, panel);
    if (panel === "vector" && def.key === "linkIntegrity") {
      on = false;
    }
    out[def.key] = on;
  }
  return out;
}
