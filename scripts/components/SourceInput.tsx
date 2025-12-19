import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface SourceInputProps {
  onSubmit: (path: string) => void;
  error: string | null;
}

export function SourceInput({ onSubmit, error }: SourceInputProps) {
  const handleSubmit = (submittedValue: string) => {
    const trimmed = submittedValue.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Enter source video file path:</Text>
      <Box>
        <Text color="cyan">{' > '}</Text>
        <TextInput
          onSubmit={handleSubmit}
          placeholder="/path/to/video.mp4"
        />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          Supported formats: .mp4, .mkv, .mov, .avi, .webm
        </Text>
      </Box>
    </Box>
  );
}
