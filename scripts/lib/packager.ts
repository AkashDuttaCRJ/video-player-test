import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  PackagerInput,
  PackagerOutput,
  RenditionQuality,
  SubtitleType,
} from './types.js';
import { getLogger } from './logger.js';

export interface PackagerCallbacks {
  onStart: () => void;
  onProgress: (message: string) => void;
  onComplete: (output: PackagerOutput) => void;
  onError: (error: string) => void;
}

function buildVideoStreamArg(input: PackagerInput): string {
  const { filePath, quality, codec } = input;
  const baseFileName = `${quality}_${codec}`;
  // Input is in tmp/ subfolder, output goes to video/ subfolder
  const inputFile = `tmp/${path.basename(filePath)}`;

  return [
    `in=${inputFile}`,
    'stream=video',
    `init_segment=video/${baseFileName}_init.mp4`,
    `segment_template=video/${baseFileName}_$Number$.m4s`,
    `playlist_name=video/${baseFileName}.m3u8`,
  ].join(',');
}

function buildAudioStreamArg(input: PackagerInput): string {
  const { filePath, language, label, index } = input;
  const safeLang = language || 'und';
  const safeLabel = label || safeLang.toUpperCase();
  // Include index in filename to ensure uniqueness for multiple audio tracks with same language
  const baseFileName = index !== undefined ? `audio_${safeLang}_${index}` : `audio_${safeLang}`;
  // Input is in tmp/ subfolder, output goes to audio/ subfolder
  const inputFile = `tmp/${path.basename(filePath)}`;

  return [
    `in=${inputFile}`,
    'stream=audio',
    `init_segment=audio/${baseFileName}_init.mp4`,
    `segment_template=audio/${baseFileName}_$Number$.m4s`,
    `playlist_name=audio/${baseFileName}.m3u8`,
    'hls_group_id=audio',
    `hls_name=${safeLabel}`,
    `language=${safeLang}`,
  ].join(',');
}

function buildSubtitleStreamArg(input: PackagerInput): string {
  const { filePath, language, label, subtitleType, isDefault } = input;
  const safeLang = language || 'und';
  const type = subtitleType || 'standard';
  // Input is in tmp/ subfolder, output goes to subtitles/ subfolder
  const inputFile = `tmp/${path.basename(filePath)}`;

  let suffix = '';
  if (type === 'forced') suffix = '_forced';
  else if (type === 'sdh') suffix = '_sdh';

  const baseFileName = `sub_${safeLang}${suffix}`;

  const parts = [
    `in=${inputFile}`,
    'stream=text',
    'format=vtt+mp4',
    `init_segment=subtitles/${baseFileName}_init.mp4`,
    `segment_template=subtitles/${baseFileName}_$Number$.m4s`,
    `playlist_name=subtitles/${baseFileName}.m3u8`,
    'hls_group_id=subtitles',
    `hls_name=${label || safeLang.toUpperCase()}`,
    `language=${safeLang}`,
  ];

  // Add type-specific options
  // Note: forced_subtitle=1 sets AUTOSELECT=YES and FORCED=YES in HLS
  if (type === 'forced') {
    parts.push('forced_subtitle=1', 'dash_roles=forced-subtitle');
  } else if (type === 'sdh') {
    parts.push(
      'dash_roles=caption',
      'hls_characteristics=public.accessibility.describes-spoken-dialog'
    );
  } else {
    parts.push('dash_roles=subtitle');
  }

  // Note: Shaka Packager doesn't support a 'default' stream descriptor field
  // The first subtitle in each language group will be the default

  return parts.join(',');
}

function buildStreamArg(input: PackagerInput): string {
  switch (input.type) {
    case 'video':
      return buildVideoStreamArg(input);
    case 'audio':
      return buildAudioStreamArg(input);
    case 'subtitle':
      return buildSubtitleStreamArg(input);
    default:
      throw new Error(`Unknown input type: ${input.type}`);
  }
}

export async function runPackager(
  inputs: PackagerInput[],
  outputDir: string,
  callbacks: PackagerCallbacks
): Promise<PackagerOutput> {
  const logger = getLogger();
  callbacks.onStart();

  await logger.section('Packaging with Shaka Packager');

  // Create output subdirectories for organized output
  await fs.mkdir(path.join(outputDir, 'video'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'audio'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'subtitles'), { recursive: true });

  const hlsPlaylist = path.join(outputDir, 'master.m3u8');
  const dashManifest = path.join(outputDir, 'manifest.mpd');

  // Build packager arguments
  const args: string[] = [];

  // Add stream arguments
  for (const input of inputs) {
    const streamArg = buildStreamArg(input);
    args.push(streamArg);
    await logger.info(`Stream: ${input.type} - ${input.filePath}`);
  }

  // Add output options
  args.push(
    '--segment_duration',
    '5',
    '--fragment_duration',
    '5',
    '--mpd_output',
    dashManifest,
    '--hls_master_playlist_output',
    hlsPlaylist,
    '--generate_static_live_mpd'
  );

  await logger.logCommand('packager', args);
  callbacks.onProgress('Starting Shaka Packager...');

  try {
    const proc = Bun.spawn(['packager', ...args], {
      cwd: outputDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Read stderr for progress
    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();

    let fullStderr = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      fullStderr += text;
      if (text.trim()) {
        callbacks.onProgress(text.trim());
      }
    }

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      await logger.error(`Packager exited with code ${exitCode}`);
      await logger.logOutput(`STDOUT:\n${stdout}`);
      await logger.logOutput(`STDERR:\n${fullStderr}`);
      throw new Error(`Packager exited with code ${exitCode}\nSTDOUT: ${stdout}\nSTDERR: ${fullStderr}`);
    }

    await logger.info(`Packaging complete`);
    await logger.info(`HLS Playlist: ${hlsPlaylist}`);
    await logger.info(`DASH Manifest: ${dashManifest}`);

    const output: PackagerOutput = {
      hlsMasterPlaylist: hlsPlaylist,
      dashManifest: dashManifest,
      outputDir: outputDir,
    };

    callbacks.onComplete(output);
    return output;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await logger.error(`Packaging failed: ${errorMessage}`);
    callbacks.onError(errorMessage);
    throw error;
  }
}

export function preparePackagerInputs(
  videoFiles: Array<{
    path: string;
    quality: RenditionQuality;
    codec: 'vp9' | 'hevc';
  }>,
  audioFiles: Array<{ path: string; language: string; label?: string; index: number }>,
  subtitleFiles: Array<{
    path: string;
    language: string;
    label?: string;
    type: SubtitleType;
    isDefault?: boolean;
  }>
): PackagerInput[] {
  const inputs: PackagerInput[] = [];

  // Add video streams
  for (const video of videoFiles) {
    inputs.push({
      type: 'video',
      filePath: video.path,
      codec: video.codec,
      quality: video.quality,
    });
  }

  // Add audio streams (include index for unique filenames)
  for (const audio of audioFiles) {
    inputs.push({
      type: 'audio',
      filePath: audio.path,
      codec: 'aac',
      language: audio.language,
      label: audio.label,
      index: audio.index,
    });
  }

  // Add subtitle streams
  for (const subtitle of subtitleFiles) {
    inputs.push({
      type: 'subtitle',
      filePath: subtitle.path,
      codec: 'webvtt',
      language: subtitle.language,
      label: subtitle.label,
      subtitleType: subtitle.type,
      isDefault: subtitle.isDefault,
    });
  }

  return inputs;
}
