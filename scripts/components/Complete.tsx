import React from 'react';
import { Box, Text } from 'ink';
import type { PackagerOutput } from '../lib/types.js';

interface CompleteProps {
  output: PackagerOutput;
  devMode: boolean;
}

export function Complete({ output, devMode }: CompleteProps) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="green">
        ✓ Transcoding Complete!
      </Text>

      {devMode && (
        <Box marginTop={1}>
          <Text color="yellow">[DEV MODE] Fast encoding used</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Output Files:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            HLS Playlist:{' '}
            <Text color="cyan">{output.hlsMasterPlaylist}</Text>
          </Text>
          <Text>
            DASH Manifest:{' '}
            <Text color="cyan">{output.dashManifest}</Text>
          </Text>
          <Text>
            Output Directory: <Text color="cyan">{output.outputDir}</Text>
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Use the HLS playlist (master.m3u8) for Safari/iOS or the DASH manifest
          (manifest.mpd) for other browsers.
        </Text>
      </Box>
    </Box>
  );
}
