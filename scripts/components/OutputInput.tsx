import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface OutputInputProps {
  defaultPath: string;
  onSubmit: (path: string) => void;
}

export function OutputInput({ defaultPath, onSubmit }: OutputInputProps) {
  const handleSubmit = (submittedValue: string) => {
    const trimmed = submittedValue.trim() || defaultPath;
    onSubmit(trimmed);
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Enter output directory:</Text>
      <Box>
        <Text color="cyan">{' > '}</Text>
        <TextInput
          defaultValue={defaultPath}
          onSubmit={handleSubmit}
          placeholder={defaultPath}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to use default: {defaultPath}</Text>
      </Box>
    </Box>
  );
}
