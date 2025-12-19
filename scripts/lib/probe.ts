import { $ } from 'bun';
import * as path from 'path';
import type {
  FFprobeOutput,
  FFprobeStream,
  MediaInfo,
  VideoInfo,
  AudioStream,
  SubtitleStream,
  HDRType,
  AudioChannelLayout,
  SubtitleType,
} from './types.js';

export class ProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProbeError';
  }
}

export async function probeMedia(filePath: string): Promise<MediaInfo> {
  // Check if file exists
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new ProbeError(`File not found: ${filePath}`);
  }

  // Run ffprobe
  let output: FFprobeOutput;
  try {
    const result =
      await $`ffprobe -v quiet -print_format json -show_format -show_streams ${filePath}`.text();
    output = JSON.parse(result);
  } catch (error) {
    throw new ProbeError(
      `Failed to probe file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Find video stream
  const videoStream = output.streams.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new ProbeError('No video stream found in file');
  }

  // Check minimum resolution
  if (!videoStream.height || videoStream.height < 720) {
    throw new ProbeError(
      `Video resolution too low: ${videoStream.height}p. Minimum 720p required.`
    );
  }

  // Parse video info
  const video = parseVideoInfo(videoStream);

  // Parse audio streams
  const audioStreams = output.streams
    .filter((s) => s.codec_type === 'audio')
    .map((s, idx) => parseAudioStream(s, idx));

  // Parse subtitle streams
  const subtitleStreams = output.streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((s, idx) => parseSubtitleStream(s, idx));

  return {
    filePath,
    fileName: path.basename(filePath),
    duration: parseFloat(output.format.duration || '0'),
    size: parseInt(output.format.size || '0', 10),
    video,
    audioStreams,
    subtitleStreams,
  };
}

function parseVideoInfo(stream: FFprobeStream): VideoInfo {
  const frameRateParts = (stream.avg_frame_rate || '24/1').split('/');
  const frameRate =
    parseInt(frameRateParts[0], 10) / parseInt(frameRateParts[1] || '1', 10);

  return {
    width: stream.width || 0,
    height: stream.height || 0,
    codec: stream.codec_name,
    profile: stream.profile || 'unknown',
    pixelFormat: stream.pix_fmt || 'unknown',
    frameRate: isNaN(frameRate) ? 24 : frameRate,
    bitrate: parseInt(stream.bit_rate || '0', 10),
    hdrType: detectHDRType(stream),
    colorPrimaries: stream.color_primaries,
    colorTransfer: stream.color_transfer,
    colorSpace: stream.color_space,
  };
}

function detectHDRType(stream: FFprobeStream): HDRType {
  // Check for Dolby Vision first (via side data)
  if (stream.side_data_list) {
    const hasDolbyVision = stream.side_data_list.some(
      (sd) =>
        sd.side_data_type === 'DOVI configuration record' ||
        sd.side_data_type?.includes('Dolby Vision')
    );
    if (hasDolbyVision) {
      return 'DolbyVision';
    }

    // Check for HDR10+ (dynamic metadata)
    const hasHDR10Plus = stream.side_data_list.some(
      (sd) =>
        sd.side_data_type === 'HDR Dynamic Metadata SMPTE2094-40 (HDR10+)' ||
        sd.side_data_type?.includes('SMPTE2094-40')
    );
    if (hasHDR10Plus) {
      return 'HDR10+';
    }
  }

  // Check for HDR10 (static metadata)
  const isBT2020 = stream.color_primaries === 'bt2020';
  const isPQ = stream.color_transfer === 'smpte2084';

  if (isBT2020 && isPQ) {
    return 'HDR10';
  }

  return 'SDR';
}

function parseAudioStream(stream: FFprobeStream, index: number): AudioStream {
  const channels = stream.channels || 2;
  let channelLayout: AudioChannelLayout = 'stereo';

  if (
    stream.channel_layout?.includes('atmos') ||
    stream.channel_layout?.includes('7.1') ||
    channels > 6
  ) {
    channelLayout = 'atmos';
  } else if (
    stream.channel_layout?.includes('5.1') ||
    stream.channel_layout?.includes('6.0') ||
    channels === 6
  ) {
    channelLayout = '5.1';
  }

  return {
    index,
    codec: stream.codec_name,
    channels,
    channelLayout,
    sampleRate: parseInt(stream.sample_rate || '48000', 10),
    bitrate: parseInt(stream.bit_rate || '0', 10),
    language: stream.tags?.language || 'und',
    title: stream.tags?.title,
    isDefault: stream.disposition?.default === 1,
  };
}

function parseSubtitleStream(
  stream: FFprobeStream,
  index: number
): SubtitleStream {
  let type: SubtitleType = 'standard';

  if (stream.disposition?.forced === 1) {
    type = 'forced';
  } else if (stream.disposition?.hearing_impaired === 1) {
    type = 'sdh';
  }

  return {
    index,
    codec: stream.codec_name,
    language: stream.tags?.language || 'und',
    title: stream.tags?.title,
    type,
    isDefault: stream.disposition?.default === 1,
  };
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
