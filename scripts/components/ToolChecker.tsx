import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import type { ToolStatus } from '../lib/types.js';

interface ToolCheckerProps {
  status: ToolStatus | null;
  installing: string | null;
  installError: string | null;
}

export function ToolChecker({
  status,
  installing,
  installError,
}: ToolCheckerProps) {
  if (!status) {
    return (
      <Box>
        <Spinner label="Checking required tools..." />
      </Box>
    );
  }

  if (installing) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Tool Status:</Text>
        <ToolStatusLine name="ffmpeg" available={status.ffmpeg} />
        <ToolStatusLine name="ffprobe" available={status.ffprobe} />
        <ToolStatusLine name="packager" available={status.packager} />
        <Box marginTop={1}>
          <Spinner label={`Installing ${installing}...`} />
        </Box>
        {installError && (
          <Box marginTop={1}>
            <Text color="red">{installError}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>Tool Status:</Text>
      <ToolStatusLine name="ffmpeg" available={status.ffmpeg} />
      <ToolStatusLine name="ffprobe" available={status.ffprobe} />
      <ToolStatusLine name="packager" available={status.packager} />
      {installError && (
        <Box marginTop={1}>
          <Text color="red">{installError}</Text>
        </Box>
      )}
    </Box>
  );
}

function ToolStatusLine({
  name,
  available,
}: {
  name: string;
  available: boolean;
}) {
  return (
    <Box>
      <Text>  {available ? '✓' : '✗'} </Text>
      <Text color={available ? 'green' : 'red'}>{name}</Text>
    </Box>
  );
}
