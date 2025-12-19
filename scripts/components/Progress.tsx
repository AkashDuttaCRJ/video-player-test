import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar, Spinner } from '@inkjs/ui';
import type { TranscodeProgress, RenditionQuality } from '../lib/types.js';

interface ProgressProps {
  currentJob: {
    codec: 'vp9' | 'hevc';
    quality: RenditionQuality;
  } | null;
  progress: TranscodeProgress | null;
  completedJobs: Array<{
    codec: 'vp9' | 'hevc';
    quality: RenditionQuality;
  }>;
  totalJobs: number;
  extractingSubtitles: boolean;
  extractingAudio: boolean;
}

export function Progress({
  currentJob,
  progress,
  completedJobs,
  totalJobs,
  extractingSubtitles,
  extractingAudio,
}: ProgressProps) {
  const overallProgress =
    totalJobs > 0 ? (completedJobs.length / totalJobs) * 100 : 0;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Transcoding Progress
      </Text>

      {/* Overall progress */}
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          Overall: {completedJobs.length}/{totalJobs} jobs completed
        </Text>
        <Box width={50}>
          <ProgressBar value={Math.round(overallProgress)} />
        </Box>
      </Box>

      {/* Pre-processing */}
      {(extractingSubtitles || extractingAudio) && (
        <Box marginTop={1} marginLeft={2}>
          {extractingSubtitles && (
            <Spinner label="Extracting subtitles..." />
          )}
          {extractingAudio && <Spinner label="Extracting audio tracks..." />}
        </Box>
      )}

      {/* Current job */}
      {currentJob && progress && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text bold>
            Current: {currentJob.quality} ({currentJob.codec.toUpperCase()})
            {progress.job.settings.passes === 2 &&
              ` - Pass ${progress.pass}/2`}
          </Text>
          <Box width={50}>
            <ProgressBar value={Math.round(progress.percent)} />
          </Box>
          <Text dimColor>
            Frame: {progress.frame}/{progress.totalFrames} | FPS:{' '}
            {progress.fps.toFixed(1)} | Speed: {progress.speed.toFixed(2)}x |
            ETA: {formatEta(progress.eta)}
          </Text>
        </Box>
      )}

      {/* Completed jobs */}
      {completedJobs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            Completed:
          </Text>
          <Box flexDirection="column" marginLeft={2}>
            {completedJobs.map((job, idx) => (
              <Text key={idx} color="green">
                ✓ {job.quality} ({job.codec.toUpperCase()})
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '--:--';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
