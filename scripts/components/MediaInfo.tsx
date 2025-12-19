import React from 'react';
import { Box, Text } from 'ink';
import type { MediaInfo as MediaInfoType } from '../lib/types.js';
import { formatDuration, formatFileSize } from '../lib/probe.js';

interface MediaInfoProps {
  info: MediaInfoType;
  onContinue: () => void;
}

export function MediaInfo({ info, onContinue }: MediaInfoProps) {
  React.useEffect(() => {
    const timer = setTimeout(onContinue, 100);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Media Information
      </Text>

      <Box flexDirection="column" marginLeft={2}>
        <Text>
          File: <Text color="white">{info.fileName}</Text>
        </Text>
        <Text>
          Duration: <Text color="white">{formatDuration(info.duration)}</Text>
        </Text>
        <Text>
          Size: <Text color="white">{formatFileSize(info.size)}</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold color="yellow">
          Video
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          Resolution:{' '}
          <Text color="white">
            {info.video.width}x{info.video.height}
          </Text>
        </Text>
        <Text>
          Codec:{' '}
          <Text color="white">
            {info.video.codec} ({info.video.profile})
          </Text>
        </Text>
        <Text>
          Frame Rate: <Text color="white">{info.video.frameRate.toFixed(2)} fps</Text>
        </Text>
        <Text>
          HDR:{' '}
          <Text color={info.video.hdrType !== 'SDR' ? 'magenta' : 'white'}>
            {info.video.hdrType}
          </Text>
        </Text>
      </Box>

      {info.audioStreams.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text bold color="yellow">
              Audio Streams ({info.audioStreams.length})
            </Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {info.audioStreams.map((stream, idx) => (
              <Text key={idx}>
                {idx + 1}. {stream.language.toUpperCase()} -{' '}
                {stream.channelLayout} ({stream.codec})
                {stream.title && ` - ${stream.title}`}
                {stream.isDefault && <Text color="green"> [Default]</Text>}
              </Text>
            ))}
          </Box>
        </>
      )}

      {info.subtitleStreams.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text bold color="yellow">
              Subtitle Streams ({info.subtitleStreams.length})
            </Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {info.subtitleStreams.map((stream, idx) => (
              <Text key={idx}>
                {idx + 1}. {stream.language.toUpperCase()} - {stream.type}
                {stream.title && ` - ${stream.title}`}
                {stream.isDefault && <Text color="green"> [Default]</Text>}
              </Text>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
