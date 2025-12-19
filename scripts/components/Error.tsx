import React from 'react';
import { Box, Text } from 'ink';

interface ErrorDisplayProps {
  message: string;
}

export function ErrorDisplay({ message }: ErrorDisplayProps) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="red">
        ✗ Error
      </Text>
      <Box marginLeft={2}>
        <Text color="red">{message}</Text>
      </Box>
    </Box>
  );
}
