import React from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import type { HWAccelInfo } from '../lib/types.js';

interface HWSelectProps {
  options: HWAccelInfo[];
  onSubmit: (selected: HWAccelInfo) => void;
}

export function HWSelect({ options, onSubmit }: HWSelectProps) {
  const selectOptions = options.map((opt) => ({
    label: opt.displayName,
    value: opt.method,
  }));

  const handleSubmit = (value: string) => {
    const selected = options.find((o) => o.method === value);
    if (selected) {
      onSubmit(selected);
    }
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Select hardware acceleration:
      </Text>
      <Text dimColor>
        Use arrow keys to navigate, enter to select
      </Text>
      <Box marginTop={1}>
        <Select options={selectOptions} onChange={handleSubmit} />
      </Box>
    </Box>
  );
}
