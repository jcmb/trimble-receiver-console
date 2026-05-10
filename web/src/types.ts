export type SVInfo = {
  prn: number;
  system: number;
  elevation_deg: number;
  azimuth_deg: number;
  /** L1 (primary) C/N₀, dB-Hz */
  cn0_db_hz: number;
  cn0_l2_db_hz?: number;
  cn0_l56_db_hz?: number;
  /** Slash-separated codes for L1/L2 tracking bucket (GSOF Flags2). */
  track_l12?: string;
  /** Slash-separated codes for L5 / E5 / Alt bucket. */
  track_l56?: string;
  used_in_position: boolean;
  used_in_rtk: boolean;
};

export type LBandStatus = {
  satellite_name?: string;
  nominal_frequency_mhz?: number;
  bit_rate_hz?: number;
  snr_db_hz?: number;
  engine?: string;
  hp_library_active?: boolean;
  vbs_library_active?: boolean;
  beam_mode?: string;
  omnistar_motion?: string;
  sigma_horizontal_threshold_m?: number;
  sigma_vertical_threshold_m?: number;
  nmea_encryption_on?: boolean;
  iq_ratio?: number;
  estimated_bit_error_rate?: number;
  total_unique_words?: number;
  bad_unique_words?: number;
  bad_unique_word_bits?: number;
  total_viterbi_symbols?: number;
  bad_viterbi_symbols?: number;
  bad_messages?: number;
  measured_frequency_trusted?: boolean;
  measured_satellite_frequency_hz?: number;
};

export type ReceivedBase = {
  flags?: number;
  info_valid?: boolean;
  base_name?: string;
  base_id?: number;
  lat_rad?: number;
  lon_rad?: number;
  height_m?: number;
};

export type BasePositionQuality = {
  gps_ms?: number;
  gps_week?: number;
  lat_rad?: number;
  lon_rad?: number;
  height_m?: number;
  quality?: number;
  quality_label?: string;
};

export type RadioBandEntry = {
  band?: string;
  channel?: number;
  signal_dbm?: number;
  signal_bars?: number;
  noise_dbm?: number;
  noise_bars?: number;
};

export type RadioInfo = {
  gps_week?: number;
  gps_ms?: number;
  radios?: RadioBandEntry[];
};

export type ReceiverSnapshot = {
  group_id: string;
  first_seen: string;
  serial: string;
  firmware_version: string;
  remote_addr: string;
  mode: "read_only" | "read_write";
  online: boolean;
  last_update: string;
  last_gsof_at: string;
  gsof_report_count: number;
  lat_rad: number;
  lon_rad: number;
  height_m: number;
  has_llh: boolean;
  position_type: number;
  position_type_label: string;
  has_position_type: boolean;
  solution_time?: string;
  time_source?: string;
  solution_gps_week?: number;
  solution_gps_ms?: number;
  battery_percent?: number;
  logging_hours_remain?: number;
  has_power_logging?: boolean;
  l_band_status?: LBandStatus;
  received_base?: ReceivedBase;
  base_position_quality?: BasePositionQuality;
  radio_info?: RadioInfo;
  xfill_present?: boolean;
  xfill_ready?: boolean;
  receiver_type?: string;
  position_rms_m: number;
  sigma_east_m: number;
  sigma_north_m: number;
  sigma_up_m: number;
  has_sigma: boolean;
  pdop: number;
  hdop: number;
  vdop: number;
  tdop: number;
  has_dop: boolean;
  horizontal_vel_ms: number;
  vertical_vel_ms: number;
  heading_rad: number;
  has_velocity: boolean;
  delta_x_m: number;
  delta_y_m: number;
  delta_z_m: number;
  has_baseline: boolean;
  satellites: SVInfo[];
  sv_used_by_system?: Record<string, number>;
  sv_tracked_by_system?: Record<string, number>;
  stream_warnings?: string[];
  last_config_json?: string;
  config_status?: string;
};

export type GroupInfo = {
  id: string;
  name: string;
  tcp_listen: string;
  people: string[];
};
