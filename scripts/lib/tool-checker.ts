import { $ } from 'bun';
import type { Platform, PackageManager, ToolStatus } from './types.js';

export function detectPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    default:
      return 'linux';
  }
}

export async function getPackageManager(): Promise<PackageManager> {
  const platform = detectPlatform();

  if (platform === 'windows') {
    try {
      await $`winget --version`.quiet();
      return 'winget';
    } catch {
      try {
        await $`choco --version`.quiet();
        return 'choco';
      } catch {
        return 'unknown';
      }
    }
  }

  if (platform === 'macos') {
    try {
      await $`brew --version`.quiet();
      return 'brew';
    } catch {
      return 'unknown';
    }
  }

  // Linux
  try {
    await $`apt --version`.quiet();
    return 'apt';
  } catch {
    return 'unknown';
  }
}

export async function checkTool(
  name: 'ffmpeg' | 'ffprobe' | 'packager'
): Promise<boolean> {
  try {
    switch (name) {
      case 'ffmpeg':
        await $`ffmpeg -version`.quiet();
        return true;
      case 'ffprobe':
        await $`ffprobe -version`.quiet();
        return true;
      case 'packager':
        await $`packager --version`.quiet();
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export async function checkAllTools(): Promise<ToolStatus> {
  const [ffmpeg, ffprobe, packager] = await Promise.all([
    checkTool('ffmpeg'),
    checkTool('ffprobe'),
    checkTool('packager'),
  ]);

  return { ffmpeg, ffprobe, packager };
}

interface InstallCommand {
  command: string;
  args: string[];
}

function getInstallCommand(
  tool: 'ffmpeg' | 'ffprobe' | 'packager',
  pkgManager: PackageManager
): InstallCommand | null {
  // ffprobe comes with ffmpeg
  const effectiveTool = tool === 'ffprobe' ? 'ffmpeg' : tool;

  const commands: Record<
    PackageManager,
    Record<'ffmpeg' | 'packager', InstallCommand | null>
  > = {
    winget: {
      ffmpeg: { command: 'winget', args: ['install', 'FFmpeg'] },
      packager: {
        command: 'winget',
        args: ['install', 'Google.ShakaPackager'],
      },
    },
    choco: {
      ffmpeg: { command: 'choco', args: ['install', 'ffmpeg', '-y'] },
      packager: {
        command: 'choco',
        args: ['install', 'shaka-packager', '-y'],
      },
    },
    brew: {
      ffmpeg: { command: 'brew', args: ['install', 'ffmpeg'] },
      packager: { command: 'brew', args: ['install', 'shaka-packager'] },
    },
    apt: {
      ffmpeg: {
        command: 'sudo',
        args: ['apt', 'install', '-y', 'ffmpeg'],
      },
      packager: {
        command: 'sudo',
        args: ['apt', 'install', '-y', 'shaka-packager'],
      },
    },
    unknown: {
      ffmpeg: null,
      packager: null,
    },
  };

  return commands[pkgManager][effectiveTool];
}

export function getManualInstallInstructions(
  tool: 'ffmpeg' | 'ffprobe' | 'packager'
): string {
  const platform = detectPlatform();
  const effectiveTool = tool === 'ffprobe' ? 'ffmpeg' : tool;

  if (effectiveTool === 'ffmpeg') {
    switch (platform) {
      case 'windows':
        return 'Download from https://ffmpeg.org/download.html or run: winget install FFmpeg';
      case 'macos':
        return 'Run: brew install ffmpeg';
      case 'linux':
        return 'Run: sudo apt install ffmpeg (or your distro equivalent)';
    }
  }

  // packager
  switch (platform) {
    case 'windows':
      return 'Download from https://github.com/shaka-project/shaka-packager/releases or run: winget install Google.ShakaPackager';
    case 'macos':
      return 'Run: brew install shaka-packager';
    case 'linux':
      return 'Download from https://github.com/shaka-project/shaka-packager/releases';
  }
}

export async function installTool(
  tool: 'ffmpeg' | 'ffprobe' | 'packager'
): Promise<{ success: boolean; message: string }> {
  const pkgManager = await getPackageManager();
  const installCmd = getInstallCommand(tool, pkgManager);

  if (!installCmd) {
    return {
      success: false,
      message: `No package manager found. ${getManualInstallInstructions(tool)}`,
    };
  }

  try {
    const proc = Bun.spawn([installCmd.command, ...installCmd.args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      return {
        success: true,
        message: `Successfully installed ${tool}`,
      };
    }

    const stderr = await new Response(proc.stderr).text();
    return {
      success: false,
      message: `Installation failed: ${stderr}\n${getManualInstallInstructions(tool)}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Installation error: ${error instanceof Error ? error.message : 'Unknown error'}\n${getManualInstallInstructions(tool)}`,
    };
  }
}
