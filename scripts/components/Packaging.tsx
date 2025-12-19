import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';

interface PackagingProps {
  message: string;
}

export function Packaging({ message }: PackagingProps) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Packaging
      </Text>
      <Box marginLeft={2}>
        <Spinner label={message || 'Running Shaka Packager...'} />
      </Box>
    </Box>
  );
}
