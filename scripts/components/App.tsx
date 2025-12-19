import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import { Spinner } from '@inkjs/ui';
import type {
  AppStep,
  ToolStatus,
  MediaInfo as MediaInfoType,
  HWAccelInfo,
  HybridHWAccel,
  Rendition,
  RenditionQuality,
  TranscodeProgress,
  PackagerOutput,
} from '../lib/types.js';
import {
  checkAllTools,
  installTool,
  getManualInstallInstructions,
} from '../lib/tool-checker.js';
import { probeMedia, ProbeError } from '../lib/probe.js';
import { detectHWAcceleration, buildHybridConfig, createHybridDisplayInfo } from '../lib/hw-detect.js';
import {
  buildRenditionLadder,
  filterRenditions,
} from '../lib/renditions.js';
import {
  transcodeRendition,
  extractSubtitles,
  extractAudio,
  ensureOutputDir,
  ensureTmpDir,
  getTranscodeSettings,
} from '../lib/transcoder.js';
import {
  runPackager,
  preparePackagerInputs,
} from '../lib/packager.js';
import { createLogger, getLogger } from '../lib/logger.js';

import { ToolChecker } from './ToolChecker.js';
import { SourceInput } from './SourceInput.js';
import { OutputInput } from './OutputInput.js';
import { MediaInfo } from './MediaInfo.js';
import { RenditionSelect } from './RenditionSelect.js';
import { HWSelect } from './HWSelect.js';
import { Progress } from './Progress.js';
import { Packaging } from './Packaging.js';
import { Complete } from './Complete.js';
import { ErrorDisplay } from './Error.js';

import * as path from 'path';

interface AppProps {
  devMode: boolean;
}

export function App({ devMode }: AppProps) {
  const { exit } = useApp();

  // Initialize logger for dev mode
  const [loggerReady, setLoggerReady] = useState(false);
  useEffect(() => {
    createLogger(devMode);
    setLoggerReady(true);
  }, [devMode]);

  // App state
  const [step, setStep] = useState<AppStep>('checking-tools');
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  const [sourcePath, setSourcePath] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState('');

  const [mediaInfo, setMediaInfo] = useState<MediaInfoType | null>(null);

  const [availableRenditions, setAvailableRenditions] = useState<Rendition[]>(
    []
  );
  const [selectedRenditions, setSelectedRenditions] = useState<
    RenditionQuality[]
  >([]);

  const [availableHWAccel, setAvailableHWAccel] = useState<HWAccelInfo[]>([]);
  const [selectedHWAccel, setSelectedHWAccel] = useState<HWAccelInfo | null>(
    null
  );
  const [hybridConfig, setHybridConfig] = useState<HybridHWAccel | null>(null);

  const [currentJob, setCurrentJob] = useState<{
    codec: 'vp9' | 'hevc';
    quality: RenditionQuality;
  } | null>(null);
  const [currentProgress, setCurrentProgress] =
    useState<TranscodeProgress | null>(null);
  const [completedJobs, setCompletedJobs] = useState<
    Array<{ codec: 'vp9' | 'hevc'; quality: RenditionQuality }>
  >([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [extractingSubtitles, setExtractingSubtitles] = useState(false);
  const [extractingAudio, setExtractingAudio] = useState(false);

  const [packagingMessage, setPackagingMessage] = useState('');
  const [packagerOutput, setPackagerOutput] = useState<PackagerOutput | null>(
    null
  );

  const [error, setError] = useState<string | null>(null);

  // Check and install tools
  useEffect(() => {
    if (step !== 'checking-tools') return;

    const checkTools = async () => {
      const status = await checkAllTools();
      setToolStatus(status);

      const missingTools: Array<'ffmpeg' | 'ffprobe' | 'packager'> = [];
      if (!status.ffmpeg) missingTools.push('ffmpeg');
      if (!status.ffprobe) missingTools.push('ffprobe');
      if (!status.packager) missingTools.push('packager');

      if (missingTools.length === 0) {
        setStep('input-source');
        return;
      }

      // Try to install missing tools
      setStep('installing-tools');
      for (const tool of missingTools) {
        setInstalling(tool);
        const result = await installTool(tool);
        if (!result.success) {
          setInstallError(
            `Failed to install ${tool}: ${result.message}\n${getManualInstallInstructions(tool)}`
          );
          setError(`Missing required tool: ${tool}`);
          setStep('error');
          return;
        }
        // Update status
        const newStatus = await checkAllTools();
        setToolStatus(newStatus);
      }

      setInstalling(null);
      setStep('input-source');
    };

    checkTools();
  }, [step]);

  // Handle source path submission
  const handleSourceSubmit = useCallback(async (inputPath: string) => {
    setSourceError(null);
    setStep('probing');

    try {
      const info = await probeMedia(inputPath);
      setMediaInfo(info);
      setSourcePath(inputPath);

      // Set default output path
      const dir = path.dirname(inputPath);
      const baseName = path.basename(inputPath, path.extname(inputPath));
      setOutputPath(path.join(dir, `${baseName}_output`));

      setStep('input-output');
    } catch (err) {
      if (err instanceof ProbeError) {
        setSourceError(err.message);
      } else {
        setSourceError(
          err instanceof Error ? err.message : 'Unknown error'
        );
      }
      setStep('input-source');
    }
  }, []);

  // Handle output path submission
  const handleOutputSubmit = useCallback(
    async (outPath: string) => {
      setOutputPath(outPath);
      setStep('displaying-info');
    },
    []
  );

  // Handle media info continue
  const handleMediaInfoContinue = useCallback(async () => {
    if (!mediaInfo) return;

    // Build rendition ladder
    const renditions = buildRenditionLadder(mediaInfo.video);
    setAvailableRenditions(renditions);
    setSelectedRenditions(renditions.map((r) => r.quality));

    // Detect hardware acceleration
    const hwOptions = await detectHWAcceleration();

    // Check if hybrid mode is available (e.g., NVIDIA for HEVC + Intel for VP9)
    const hybrid = buildHybridConfig(hwOptions);
    setHybridConfig(hybrid);

    // Build display options - add hybrid at the top if available
    let displayOptions = [...hwOptions];
    if (hybrid) {
      const hybridDisplay = createHybridDisplayInfo(hybrid);
      // Add hybrid option at the beginning (recommended)
      displayOptions = [hybridDisplay, ...hwOptions];
    }
    setAvailableHWAccel(displayOptions);

    if (devMode) {
      setStep('selecting-renditions');
    } else if (displayOptions.length > 1) {
      setStep('selecting-hw');
    } else {
      setSelectedHWAccel(displayOptions[0]);
      startTranscoding(
        renditions.map((r) => r.quality),
        displayOptions[0],
        hybrid && displayOptions[0].displayName.startsWith('Hybrid') ? hybrid : null
      );
    }
  }, [mediaInfo, devMode]);

  // Handle rendition selection (dev mode)
  const handleRenditionSelect = useCallback(
    (selected: RenditionQuality[]) => {
      setSelectedRenditions(selected);
      if (availableHWAccel.length > 1) {
        setStep('selecting-hw');
      } else {
        const hw = availableHWAccel[0];
        setSelectedHWAccel(hw);
        // Check if it's the hybrid option
        const isHybrid = hw.displayName.startsWith('Hybrid');
        startTranscoding(selected, hw, isHybrid ? hybridConfig : null);
      }
    },
    [availableHWAccel, hybridConfig]
  );

  // Handle HW selection
  const handleHWSelect = useCallback(
    (hw: HWAccelInfo) => {
      setSelectedHWAccel(hw);
      // Check if user selected the hybrid option
      const isHybrid = hw.displayName.startsWith('Hybrid');
      startTranscoding(selectedRenditions, hw, isHybrid ? hybridConfig : null);
    },
    [selectedRenditions, hybridConfig]
  );

  // Start transcoding
  const startTranscoding = useCallback(
    async (
      renditionQualities: RenditionQuality[],
      hwAccel: HWAccelInfo,
      hybrid: HybridHWAccel | null = null
    ) => {
      if (!mediaInfo) return;

      setStep('transcoding');

      try {
        await ensureOutputDir(outputPath);
        const tmpDir = await ensureTmpDir(outputPath);

        // Initialize logger with output directory in dev mode
        const logger = getLogger();
        await logger.init(outputPath);
        await logger.info(`Source: ${sourcePath}`);
        await logger.info(`Media: ${mediaInfo.video.width}x${mediaInfo.video.height} ${mediaInfo.video.hdrType}`);

        const renditions = filterRenditions(
          availableRenditions,
          renditionQualities
        );
        const settings = getTranscodeSettings(devMode ? 'dev' : 'prod');
        const skipIfExists = devMode; // Skip existing files in dev mode

        await logger.info(`Mode: ${devMode ? 'DEV' : 'PROD'}`);
        await logger.info(`Skip existing: ${skipIfExists}`);
        await logger.info(`Renditions: ${renditions.map(r => r.quality).join(', ')}`);
        await logger.info(`HW Accel: ${hwAccel.displayName}`);
        if (hybrid) {
          await logger.info(`Hybrid Mode: HEVC=${hybrid.hevc.displayName}, VP9=${hybrid.vp9.displayName}`);
        }

        // Calculate total jobs (VP9 + HEVC for each rendition)
        const jobs = renditions.length * 2;
        setTotalJobs(jobs);

        // Extract subtitles first (to tmp folder)
        if (mediaInfo.subtitleStreams.length > 0) {
          setExtractingSubtitles(true);
          await extractSubtitles(
            sourcePath,
            tmpDir,
            mediaInfo.subtitleStreams,
            skipIfExists
          );
          setExtractingSubtitles(false);
        }

        // Extract audio (to tmp folder)
        if (mediaInfo.audioStreams.length > 0) {
          setExtractingAudio(true);
          await extractAudio(sourcePath, tmpDir, mediaInfo.audioStreams, skipIfExists);
          setExtractingAudio(false);
        }

        // Transcode each rendition
        const videoFiles: Array<{
          path: string;
          quality: RenditionQuality;
          codec: 'vp9' | 'hevc';
        }> = [];

        // Determine which HW to use for each codec (hybrid mode uses different HW per codec)
        const vp9HWAccel = hybrid ? hybrid.vp9 : hwAccel;
        const hevcHWAccel = hybrid ? hybrid.hevc : hwAccel;

        for (const rendition of renditions) {
          // VP9 (output to tmp folder)
          setCurrentJob({ codec: 'vp9', quality: rendition.quality });
          try {
            const vp9Path = await transcodeRendition(
              sourcePath,
              tmpDir,
              rendition,
              'vp9',
              vp9HWAccel,
              mediaInfo,
              settings,
              {
                onProgress: setCurrentProgress,
                onPassComplete: () => {},
                onComplete: () => {
                  setCompletedJobs((prev) => [
                    ...prev,
                    { codec: 'vp9', quality: rendition.quality },
                  ]);
                },
                onError: () => {},
              },
              skipIfExists
            );
            if (vp9Path) {
              videoFiles.push({
                path: vp9Path,
                quality: rendition.quality,
                codec: 'vp9',
              });
            }
          } catch {
            // Continue with HEVC even if VP9 fails
          }

          // HEVC (output to tmp folder)
          setCurrentJob({ codec: 'hevc', quality: rendition.quality });
          try {
            const hevcPath = await transcodeRendition(
              sourcePath,
              tmpDir,
              rendition,
              'hevc',
              hevcHWAccel,
              mediaInfo,
              settings,
              {
                onProgress: setCurrentProgress,
                onPassComplete: () => {},
                onComplete: () => {
                  setCompletedJobs((prev) => [
                    ...prev,
                    { codec: 'hevc', quality: rendition.quality },
                  ]);
                },
                onError: () => {},
              },
              skipIfExists
            );
            if (hevcPath) {
              videoFiles.push({
                path: hevcPath,
                quality: rendition.quality,
                codec: 'hevc',
              });
            }
          } catch {
            // Continue even if HEVC fails
          }
        }

        setCurrentJob(null);
        setCurrentProgress(null);

        // Package
        setStep('packaging');

        // Audio and subtitle files are in the tmp folder
        const audioFiles = mediaInfo.audioStreams.map((s, idx) => ({
          path: path.join(tmpDir, `audio_${s.language}_${idx}.mp4`),
          language: s.language,
          label: s.title,
          index: idx,
        }));

        const subtitleFiles = mediaInfo.subtitleStreams.map((s) => {
          const suffix =
            s.type === 'forced'
              ? '_forced'
              : s.type === 'sdh'
                ? '_sdh'
                : '';
          return {
            path: path.join(tmpDir, `sub_${s.language}${suffix}.vtt`),
            language: s.language,
            label: s.title,
            type: s.type,
            isDefault: s.isDefault,
          };
        });

        const inputs = preparePackagerInputs(
          videoFiles,
          audioFiles,
          subtitleFiles
        );

        const output = await runPackager(inputs, outputPath, {
          onStart: () => setPackagingMessage('Starting Shaka Packager...'),
          onProgress: setPackagingMessage,
          onComplete: (out) => {
            setPackagerOutput(out);
            setStep('complete');
          },
          onError: (err) => {
            setError(`Packaging failed: ${err}`);
            setStep('error');
          },
        }, devMode);

        await logger.close();
        setPackagerOutput(output);
        setStep('complete');
      } catch (err) {
        const logger = getLogger();
        await logger.error(err instanceof Error ? err.message : 'Unknown error');
        await logger.close();
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStep('error');
      }
    },
    [mediaInfo, outputPath, sourcePath, availableRenditions, devMode]
  );

  // Render based on step
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          VOD Transcoder
        </Text>
        {devMode && (
          <Text color="yellow"> [DEV MODE]</Text>
        )}
      </Box>

      {(step === 'checking-tools' || step === 'installing-tools') && (
        <ToolChecker
          status={toolStatus}
          installing={installing}
          installError={installError}
        />
      )}

      {step === 'input-source' && (
        <SourceInput onSubmit={handleSourceSubmit} error={sourceError} />
      )}

      {step === 'probing' && (
        <Spinner label="Analyzing video file..." />
      )}

      {step === 'input-output' && (
        <OutputInput defaultPath={outputPath} onSubmit={handleOutputSubmit} />
      )}

      {step === 'displaying-info' && mediaInfo && (
        <MediaInfo info={mediaInfo} onContinue={handleMediaInfoContinue} />
      )}

      {step === 'selecting-renditions' && (
        <RenditionSelect
          renditions={availableRenditions}
          onSubmit={handleRenditionSelect}
        />
      )}

      {step === 'selecting-hw' && (
        <HWSelect options={availableHWAccel} onSubmit={handleHWSelect} />
      )}

      {step === 'transcoding' && (
        <Progress
          currentJob={currentJob}
          progress={currentProgress}
          completedJobs={completedJobs}
          totalJobs={totalJobs}
          extractingSubtitles={extractingSubtitles}
          extractingAudio={extractingAudio}
        />
      )}

      {step === 'packaging' && <Packaging message={packagingMessage} />}

      {step === 'complete' && packagerOutput && (
        <Complete output={packagerOutput} devMode={devMode} />
      )}

      {step === 'error' && error && <ErrorDisplay message={error} />}
    </Box>
  );
}
