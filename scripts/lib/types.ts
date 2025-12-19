// CLI Arguments
export interface CLIArgs {
  devMode: boolean;
}

// Tool Status
export interface ToolStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
  packager: boolean;
}

export type Platform = 'windows' | 'macos' | 'linux';
export type PackageManager = 'winget' | 'choco' | 'brew' | 'apt' | 'unknown';

// FFprobe types
export interface FFprobeOutput {
  format: FFprobeFormat;
  streams: FFprobeStream[];
}

export interface FFprobeFormat {
  filename: string;
  nb_streams: number;
  format_name: string;
  format_long_name: string;
  duration: string;
  size: string;
  bit_rate: string;
  tags?: Record<string, string>;
}

export interface FFprobeStream {
  index: number;
  codec_name: string;
  codec_long_name: string;
  codec_type: 'video' | 'audio' | 'subtitle';
  profile?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  pix_fmt?: string;
  level?: number;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  field_order?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bits_per_sample?: number;
  bit_rate?: string;
  duration?: string;
  tags?: Record<string, string>;
  disposition?: FFprobeDisposition;
  side_data_list?: FFprobeSideData[];
}

export interface FFprobeDisposition {
  default: number;
  dub: number;
  original: number;
  comment: number;
  lyrics: number;
  karaoke: number;
  forced: number;
  hearing_impaired: number;
  visual_impaired: number;
  clean_effects: number;
  attached_pic: number;
  timed_thumbnails: number;
}

export interface FFprobeSideData {
  side_data_type: string;
  [key: string]: unknown;
}

// Media Info
export type HDRType = 'SDR' | 'HDR10' | 'HDR10+' | 'DolbyVision';

export interface VideoInfo {
  width: number;
  height: number;
  codec: string;
  profile: string;
  pixelFormat: string;
  frameRate: number;
  bitrate: number;
  hdrType: HDRType;
  colorPrimaries?: string;
  colorTransfer?: string;
  colorSpace?: string;
}

export type AudioChannelLayout = 'stereo' | '5.1' | 'atmos';

export interface AudioStream {
  index: number;
  codec: string;
  channels: number;
  channelLayout: AudioChannelLayout;
  sampleRate: number;
  bitrate: number;
  language: string;
  title?: string;
  isDefault: boolean;
}

export type SubtitleType = 'standard' | 'forced' | 'sdh';

export interface SubtitleStream {
  index: number;
  codec: string;
  language: string;
  title?: string;
  type: SubtitleType;
  isDefault: boolean;
}

export interface MediaInfo {
  filePath: string;
  fileName: string;
  duration: number;
  size: number;
  video: VideoInfo;
  audioStreams: AudioStream[];
  subtitleStreams: SubtitleStream[];
}

// Hardware Acceleration
export type HWAccelMethod =
  | 'nvidia'
  | 'qsv'
  | 'amf'
  | 'vaapi'
  | 'videotoolbox'
  | 'software';

export interface HWAccelInfo {
  method: HWAccelMethod;
  displayName: string;
  hevcEncoder: string;
  vp9Encoder: string;
  hwaccelFlag?: string;
  hwaccelOutputFormat?: string;
  scaleFilter: string;
  supportsVP9HW?: boolean; // True if VP9 uses hardware encoder (not libvpx-vp9)
  supportsHEVC10bit?: boolean; // True if HEVC 10-bit encoding supported
  supportsVP910bit?: boolean; // True if VP9 10-bit encoding supported
}

// Hybrid encoding: use different HW for different codecs
export interface HybridHWAccel {
  hevc: HWAccelInfo; // HW to use for HEVC encoding
  vp9: HWAccelInfo; // HW to use for VP9 encoding
}

// Renditions
export type RenditionQuality = '2160p' | '1440p' | '1080p' | '720p' | '480p';

export interface Rendition {
  quality: RenditionQuality;
  width: number;
  height: number;
  vp9Bitrate: number;
  hevcBitrate: number;
  maxrate: number;
  bufsize: number;
  preserveHDR: boolean;
}

// Transcoding
export type TranscodeMode = 'dev' | 'prod';

export interface TranscodeSettings {
  mode: TranscodeMode;
  passes: 1 | 2;
  vp9Deadline: 'realtime' | 'good';
  vp9CpuUsed: number;
  hevcPreset: string;
  x265Preset: string;
}

export interface TranscodeJob {
  rendition: Rendition;
  codec: 'vp9' | 'hevc';
  inputPath: string;
  outputPath: string;
  hwAccel: HWAccelInfo;
  settings: TranscodeSettings;
  sourceInfo: MediaInfo;
}

export interface TranscodeProgress {
  job: TranscodeJob;
  pass: 1 | 2;
  frame: number;
  totalFrames: number;
  fps: number;
  speed: number;
  percent: number;
  eta: number;
}

// Packager
export interface PackagerInput {
  type: 'video' | 'audio' | 'subtitle';
  filePath: string;
  codec: string;
  quality?: RenditionQuality;
  language?: string;
  label?: string;
  subtitleType?: SubtitleType;
  isDefault?: boolean;
  index?: number; // Unique index to differentiate streams with same language
}

export interface PackagerOutput {
  hlsMasterPlaylist: string;
  dashManifest: string;
  outputDir: string;
}

// App State
export type AppStep =
  | 'checking-tools'
  | 'installing-tools'
  | 'input-source'
  | 'input-output'
  | 'probing'
  | 'displaying-info'
  | 'selecting-renditions'
  | 'selecting-hw'
  | 'transcoding'
  | 'packaging'
  | 'complete'
  | 'error';

export interface AppState {
  step: AppStep;
  devMode: boolean;
  toolStatus: ToolStatus;
  sourcePath: string;
  outputPath: string;
  mediaInfo: MediaInfo | null;
  selectedRenditions: RenditionQuality[];
  availableHWAccel: HWAccelInfo[];
  selectedHWAccel: HWAccelInfo | null;
  hybridHWAccel: HybridHWAccel | null; // For hybrid mode (different HW per codec)
  transcodeProgress: Map<string, TranscodeProgress>;
  packagerOutput: PackagerOutput | null;
  error: string | null;
}
