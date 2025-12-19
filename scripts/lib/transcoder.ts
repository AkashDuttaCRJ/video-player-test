import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  MediaInfo,
  Rendition,
  HWAccelInfo,
  TranscodeMode,
  TranscodeSettings,
  TranscodeProgress,
  AudioStream,
  SubtitleStream,
} from './types.js';
import { getLogger } from './logger.js';

export interface TranscodeCallbacks {
  onProgress: (progress: TranscodeProgress) => void;
  onPassComplete: (pass: 1 | 2, codec: 'vp9' | 'hevc', quality: string) => void;
  onComplete: (
    codec: 'vp9' | 'hevc',
    quality: string,
    outputPath: string
  ) => void;
  onError: (codec: 'vp9' | 'hevc', quality: string, error: string) => void;
}

export function getTranscodeSettings(mode: TranscodeMode): TranscodeSettings {
  if (mode === 'dev') {
    return {
      mode: 'dev',
      passes: 1,
      vp9Deadline: 'realtime',
      vp9CpuUsed: 8,
      hevcPreset: 'p1',
      x265Preset: 'ultrafast',
    };
  }

  return {
    mode: 'prod',
    passes: 2,
    vp9Deadline: 'good',
    vp9CpuUsed: 2,
    hevcPreset: 'p5',
    x265Preset: 'medium',
  };
}

// HDR to SDR tone mapping filter for lower renditions
// Software-based zscale tonemap (slow but compatible)
const TONEMAP_FILTER_SOFTWARE =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

/**
 * Build scale filter using height-based scaling to preserve aspect ratio.
 * Uses -2 for width to ensure it's divisible by 2 (required by most encoders).
 */
function buildScaleFilter(
  rendition: Rendition,
  hwAccel: HWAccelInfo,
  needsTonemap: boolean,
  codec: 'vp9' | 'hevc' = 'hevc'
): string {
  const { height } = rendition;

  if (needsTonemap) {
    // All tonemapping uses software pipeline for maximum compatibility
    // OpenCL/CUDA tonemap often fails due to driver issues on Windows

    // NVIDIA HEVC: Software tonemap + scale, then hwupload for NVENC encoding
    if (hwAccel.method === 'nvidia' && codec === 'hevc') {
      return `${TONEMAP_FILTER_SOFTWARE},scale=-2:${height},hwupload_cuda`;
    }
    // QSV VP9: Software tonemap + scale, output nv12 for QSV encoder
    if (hwAccel.method === 'qsv' && codec === 'vp9' && hwAccel.supportsVP9HW) {
      return `${TONEMAP_FILTER_SOFTWARE},scale=-2:${height},format=nv12`;
    }
    // VAAPI VP9: Software tonemap + scale
    if (hwAccel.method === 'vaapi' && codec === 'vp9' && hwAccel.supportsVP9HW) {
      return `${TONEMAP_FILTER_SOFTWARE},scale=-2:${height}`;
    }
    // Other HW or software: Software tonemap + scale
    return `${TONEMAP_FILTER_SOFTWARE},scale=-2:${height}`;
  }

  // No tonemapping needed - use HW scaling where available
  if (hwAccel.method === 'nvidia') {
    return `scale_cuda=w=-2:h=${height}`;
  }

  if (hwAccel.method === 'qsv') {
    return `scale_qsv=w=-2:h=${height}`;
  }

  if (hwAccel.method === 'vaapi') {
    return `scale_vaapi=w=-2:h=${height}`;
  }

  // Software or other - use -2 for width to preserve aspect ratio
  return `scale=-2:${height}`;
}

function buildVP9Args(
  rendition: Rendition,
  settings: TranscodeSettings,
  pass: 1 | 2,
  passLogFile: string,
  hwAccel: HWAccelInfo
): string[] {
  const bitrate = rendition.vp9Bitrate;
  const maxrate = rendition.maxrate;
  const bufsize = rendition.bufsize;

  // Intel QSV VP9 hardware encoding (8-bit only)
  // Note: vp9_qsv has limited options - no look_ahead, no two-pass
  if (hwAccel.method === 'qsv' && hwAccel.supportsVP9HW) {
    return [
      '-c:v',
      'vp9_qsv',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
      // Use low_power mode for better compatibility
      '-low_power',
      '1',
    ];
  }

  // VAAPI VP9 hardware encoding (Linux)
  if (hwAccel.method === 'vaapi' && hwAccel.supportsVP9HW) {
    return [
      '-c:v',
      'vp9_vaapi',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
      '-keyint_min',
      '120',
    ];
  }

  // Software VP9 (libvpx-vp9) - default fallback
  const args = [
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    `${bitrate}k`,
    '-g',
    '120',
    '-keyint_min',
    '120',
    '-deadline',
    settings.vp9Deadline,
    '-cpu-used',
    settings.vp9CpuUsed.toString(),
    '-row-mt',
    '1',
    '-tile-columns',
    '2',
    '-tile-rows',
    '1',
  ];

  if (settings.passes === 2) {
    args.push('-pass', pass.toString(), '-passlogfile', passLogFile);

    if (pass === 2) {
      args.push('-maxrate', `${maxrate}k`, '-bufsize', `${bufsize}k`);
    }
  } else {
    args.push('-maxrate', `${maxrate}k`, '-bufsize', `${bufsize}k`);
  }

  return args;
}

function buildHEVCArgs(
  rendition: Rendition,
  settings: TranscodeSettings,
  hwAccel: HWAccelInfo
): string[] {
  const bitrate = rendition.hevcBitrate;
  const maxrate = Math.floor(bitrate * 1.5);
  const bufsize = bitrate * 2;

  // NVIDIA can do GPU tonemapping + GPU encoding (fast)
  if (hwAccel.method === 'nvidia') {
    return [
      '-c:v',
      'hevc_nvenc',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
      '-keyint_min',
      '120',
      '-preset',
      settings.hevcPreset,
      ...(settings.mode === 'prod' ? ['-multipass', 'fullres'] : []),
    ];
  }

  if (hwAccel.method === 'qsv') {
    return [
      '-c:v',
      'hevc_qsv',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
      '-preset',
      settings.mode === 'prod' ? 'medium' : 'veryfast',
    ];
  }

  if (hwAccel.method === 'amf') {
    return [
      '-c:v',
      'hevc_amf',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
      '-quality',
      settings.mode === 'prod' ? 'balanced' : 'speed',
    ];
  }

  if (hwAccel.method === 'vaapi') {
    return [
      '-c:v',
      'hevc_vaapi',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
    ];
  }

  if (hwAccel.method === 'videotoolbox') {
    return [
      '-c:v',
      'hevc_videotoolbox',
      '-b:v',
      `${bitrate}k`,
      '-maxrate',
      `${maxrate}k`,
      '-bufsize',
      `${bufsize}k`,
      '-g',
      '120',
    ];
  }

  // Software x265
  return [
    '-c:v',
    'libx265',
    '-b:v',
    `${bitrate}k`,
    '-maxrate',
    `${maxrate}k`,
    '-bufsize',
    `${bufsize}k`,
    '-g',
    '120',
    '-keyint_min',
    '120',
    '-preset',
    settings.x265Preset,
    '-x265-params',
    'log-level=error',
  ];
}

function buildHWAccelInputArgs(hwAccel: HWAccelInfo): string[] {
  if (hwAccel.hwaccelFlag && hwAccel.method !== 'software') {
    const args = ['-hwaccel', hwAccel.hwaccelFlag];
    if (hwAccel.hwaccelOutputFormat) {
      args.push('-hwaccel_output_format', hwAccel.hwaccelOutputFormat);
    }
    return args;
  }
  return [];
}

function getAudioBitrate(stream: AudioStream): string {
  switch (stream.channelLayout) {
    case 'atmos':
      return '768k';
    case '5.1':
      return '640k';
    default:
      return '128k';
  }
}

function getAudioCodec(stream: AudioStream): string {
  // Use E-AC3 for surround, AAC for stereo
  return stream.channelLayout === 'stereo' ? 'aac' : 'eac3';
}

export function getOutputFileName(
  rendition: Rendition,
  codec: 'vp9' | 'hevc'
): string {
  const ext = codec === 'vp9' ? 'webm' : 'mp4';
  return `video_${rendition.quality}_${codec}.${ext}`;
}

export async function checkOutputExists(
  outputDir: string,
  rendition: Rendition,
  codec: 'vp9' | 'hevc'
): Promise<boolean> {
  const outputFileName = getOutputFileName(rendition, codec);
  const outputPath = path.join(outputDir, outputFileName);
  try {
    await fs.access(outputPath);
    return true;
  } catch {
    return false;
  }
}

export async function transcodeRendition(
  inputPath: string,
  outputDir: string,
  rendition: Rendition,
  codec: 'vp9' | 'hevc',
  hwAccel: HWAccelInfo,
  mediaInfo: MediaInfo,
  settings: TranscodeSettings,
  callbacks: TranscodeCallbacks,
  skipIfExists: boolean = false
): Promise<string | null> {
  const logger = getLogger();
  const ext = codec === 'vp9' ? 'webm' : 'mp4';
  const outputFileName = `video_${rendition.quality}_${codec}.${ext}`;
  const outputPath = path.join(outputDir, outputFileName);
  const passLogFile = path.join(outputDir, `ffmpeg2pass_${rendition.quality}`);

  await logger.section(`Transcoding ${rendition.quality} ${codec.toUpperCase()}`);
  await logger.info(`Output: ${outputPath}`);

  // Check if output already exists (dev mode skip)
  if (skipIfExists) {
    try {
      await fs.access(outputPath);
      await logger.info(`SKIPPED: Output file already exists`);
      callbacks.onComplete(codec, rendition.quality, outputPath);
      return outputPath;
    } catch {
      // File doesn't exist, continue with transcoding
    }
  }

  const totalFrames = Math.ceil(
    mediaInfo.duration * mediaInfo.video.frameRate
  );

  // Determine if we need to tonemap HDR to SDR
  // For VP9 with QSV/VAAPI: always tonemap because VP9 HW encoding is 8-bit only
  // For others: tonemap based on rendition preserveHDR setting
  let needsTonemap = !rendition.preserveHDR && mediaInfo.video.hdrType !== 'SDR';
  if (
    codec === 'vp9' &&
    (hwAccel.method === 'qsv' || hwAccel.method === 'vaapi') &&
    hwAccel.supportsVP9HW &&
    mediaInfo.video.hdrType !== 'SDR'
  ) {
    // Intel/VAAPI VP9 is 8-bit only, always tonemap HDR content
    needsTonemap = true;
  }

  // Determine if we should use HW accel for input decoding
  // Don't use HW accel input when tonemapping (software tonemap needs CPU frames)
  // Exception: NVIDIA HEVC can do GPU tonemap pipeline
  let useHwAccelInput = false;
  if (codec === 'hevc' && hwAccel.method === 'nvidia') {
    // NVIDIA can handle tonemap on GPU, but the pipeline is complex
    // For now, don't use HW accel input when tonemapping to simplify the filter chain
    useHwAccelInput = !needsTonemap;
  } else if (codec === 'hevc' && !needsTonemap) {
    // Other HW: Only use HW accel when not tonemapping
    useHwAccelInput = true;
  } else if (codec === 'vp9') {
    // VP9: Don't use HW accel input (software decode + software tonemap + software scale)
    // The encoder will handle the HW encoding from CPU frames
    useHwAccelInput = false;
  }

  const scaleFilter = buildScaleFilter(rendition, hwAccel, needsTonemap, codec);

  await logger.info(`Total frames: ${totalFrames}`);
  await logger.info(`Needs tonemap: ${needsTonemap}`);
  await logger.info(`Scale filter: ${scaleFilter}`);
  await logger.info(`HW Accel: ${hwAccel.displayName}`);

  const runPass = async (pass: 1 | 2, isLastPass: boolean): Promise<void> => {
    const args: string[] = ['-y'];

    // Input args (HW accel)
    // Only use HW accel input when useHwAccelInput is true
    // This is determined above based on codec, HW method, and tonemap requirements
    if (useHwAccelInput) {
      args.push(...buildHWAccelInputArgs(hwAccel));
    }

    args.push('-i', inputPath);

    // Video filter
    args.push('-vf', scaleFilter);

    // Codec-specific args
    if (codec === 'vp9') {
      args.push(...buildVP9Args(rendition, settings, pass, passLogFile, hwAccel));
    } else {
      args.push(...buildHEVCArgs(rendition, settings, hwAccel));
    }

    if (isLastPass) {
      // Video-only output (audio is extracted separately for packaging)
      args.push('-an');
      args.push(outputPath);
    } else {
      // First pass - null output
      args.push('-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null');
    }

    await logger.logCommand('ffmpeg', args);

    // Run FFmpeg
    const proc = Bun.spawn(['ffmpeg', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Parse progress from stderr
    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();

    let stderrBuffer = '';
    let fullStderr = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      stderrBuffer += chunk;
      fullStderr += chunk;

      // Parse progress lines
      const frameMatch = stderrBuffer.match(/frame=\s*(\d+)/);
      const fpsMatch = stderrBuffer.match(/fps=\s*([\d.]+)/);
      const speedMatch = stderrBuffer.match(/speed=\s*([\d.]+)x/);

      if (frameMatch) {
        const frame = parseInt(frameMatch[1], 10);
        const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
        const speed = speedMatch ? parseFloat(speedMatch[1]) : 1;
        const percent = Math.min((frame / totalFrames) * 100, 100);
        const remainingFrames = totalFrames - frame;
        const eta = fps > 0 ? remainingFrames / fps : 0;

        callbacks.onProgress({
          job: {
            rendition,
            codec,
            inputPath,
            outputPath,
            hwAccel,
            settings,
            sourceInfo: mediaInfo,
          },
          pass,
          frame,
          totalFrames,
          fps,
          speed,
          percent,
          eta,
        });
      }

      // Clear buffer periodically to avoid memory issues
      if (stderrBuffer.length > 10000) {
        stderrBuffer = stderrBuffer.slice(-1000);
      }
    }

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      await logger.error(`FFmpeg exited with code ${exitCode}`);
      await logger.logOutput(fullStderr);
      throw new Error(`FFmpeg exited with code ${exitCode}\n${fullStderr.slice(-2000)}`);
    }

    await logger.info(`Pass ${pass} completed successfully`);
    callbacks.onPassComplete(pass, codec, rendition.quality);
  };

  try {
    if (codec === 'vp9' && settings.passes === 2) {
      await runPass(1, false);
      await runPass(2, true);
    } else {
      await runPass(1, true);
    }

    await logger.info(`Transcoding complete: ${outputPath}`);
    callbacks.onComplete(codec, rendition.quality, outputPath);
    return outputPath;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await logger.error(`Transcoding failed: ${errorMessage}`);
    callbacks.onError(codec, rendition.quality, errorMessage);
    throw error;
  }
}

export async function extractSubtitles(
  inputPath: string,
  outputDir: string,
  subtitleStreams: SubtitleStream[],
  skipIfExists: boolean = false
): Promise<Map<number, string>> {
  const logger = getLogger();
  const outputPaths = new Map<number, string>();

  await logger.section('Extracting Subtitles');

  for (let idx = 0; idx < subtitleStreams.length; idx++) {
    const stream = subtitleStreams[idx];
    const suffix =
      stream.type === 'forced'
        ? '_forced'
        : stream.type === 'sdh'
          ? '_sdh'
          : '';
    const outputFileName = `sub_${stream.language}${suffix}.vtt`;
    const outputPath = path.join(outputDir, outputFileName);

    await logger.info(`Extracting subtitle: ${stream.language} (${stream.type})`);

    // Check if exists
    if (skipIfExists) {
      try {
        await fs.access(outputPath);
        await logger.info(`SKIPPED: ${outputFileName} already exists`);
        outputPaths.set(idx, outputPath);
        continue;
      } catch {
        // File doesn't exist, continue
      }
    }

    const args = [
      '-y',
      '-i',
      inputPath,
      '-map',
      // Use relative subtitle stream index (idx), not absolute stream index
      `0:s:${idx}`,
      '-c:s',
      'webvtt',
      outputPath,
    ];

    await logger.logCommand('ffmpeg', args);

    const proc = Bun.spawn(['ffmpeg', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    if (exitCode === 0) {
      await logger.info(`Extracted: ${outputFileName}`);
      outputPaths.set(idx, outputPath);
    } else {
      const stderr = await new Response(proc.stderr).text();
      await logger.error(`Failed to extract subtitle: ${stderr}`);
    }
  }

  return outputPaths;
}

export async function extractAudio(
  inputPath: string,
  outputDir: string,
  audioStreams: AudioStream[],
  skipIfExists: boolean = false
): Promise<Map<number, string>> {
  const logger = getLogger();
  const outputPaths = new Map<number, string>();

  await logger.section('Extracting Audio');

  for (let idx = 0; idx < audioStreams.length; idx++) {
    const stream = audioStreams[idx];
    // Use array index for filename to match App.tsx expectations
    const outputFileName = `audio_${stream.language}_${idx}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);

    await logger.info(`Extracting audio: ${stream.language} (${stream.channelLayout})`);

    // Check if exists
    if (skipIfExists) {
      try {
        await fs.access(outputPath);
        await logger.info(`SKIPPED: ${outputFileName} already exists`);
        outputPaths.set(idx, outputPath);
        continue;
      } catch {
        // File doesn't exist, continue
      }
    }

    const codec = getAudioCodec(stream);
    const bitrate = getAudioBitrate(stream);

    const args = [
      '-y',
      '-i',
      inputPath,
      '-map',
      // Use relative audio stream index (idx), not absolute stream index
      `0:a:${idx}`,
      '-c:a',
      codec,
      '-b:a',
      bitrate,
      '-vn',
      outputPath,
    ];

    await logger.logCommand('ffmpeg', args);

    const proc = Bun.spawn(['ffmpeg', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    if (exitCode === 0) {
      await logger.info(`Extracted: ${outputFileName}`);
      outputPaths.set(idx, outputPath);
    } else {
      const stderr = await new Response(proc.stderr).text();
      await logger.error(`Failed to extract audio: ${stderr}`);
    }
  }

  return outputPaths;
}

export async function ensureOutputDir(outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
}

export async function ensureTmpDir(outputDir: string): Promise<string> {
  const tmpDir = path.join(outputDir, 'tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}
