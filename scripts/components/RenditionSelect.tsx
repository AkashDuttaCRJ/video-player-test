import React from 'react';
import { Box, Text } from 'ink';
import { MultiSelect } from '@inkjs/ui';
import type { Rendition, RenditionQuality } from '../lib/types.js';
import { getRenditionLabel } from '../lib/renditions.js';

interface RenditionSelectProps {
  renditions: Rendition[];
  onSubmit: (selected: RenditionQuality[]) => void;
}

export function RenditionSelect({
  renditions,
  onSubmit,
}: RenditionSelectProps) {
  const options = renditions.map((r) => ({
    label: getRenditionLabel(r),
    value: r.quality,
  }));

  const handleSubmit = (selectedValues: string[]) => {
    if (selectedValues.length === 0) {
      // If nothing selected, use all renditions
      onSubmit(renditions.map((r) => r.quality));
    } else {
      onSubmit(selectedValues as RenditionQuality[]);
    }
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        [DEV MODE] Select renditions to process:
      </Text>
      <Text dimColor>
        Use arrow keys to navigate, space to select, enter to confirm
      </Text>
      <Box marginTop={1}>
        <MultiSelect
          options={options}
          onSubmit={handleSubmit}
          defaultValue={renditions.map((r) => r.quality)}
        />
      </Box>
    </Box>
  );
}
