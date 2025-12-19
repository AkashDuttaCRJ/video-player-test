import * as fs from 'fs/promises';
import * as path from 'path';

export class Logger {
  private logPath: string | null = null;
  private buffer: string[] = [];
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async init(outputDir: string): Promise<void> {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logPath = path.join(outputDir, `transcode_${timestamp}.log`);

    // Write header
    await this.write(`=== VOD Transcoder Log ===`);
    await this.write(`Started: ${new Date().toISOString()}`);
    await this.write(`Output Directory: ${outputDir}`);
    await this.write(`Mode: DEV`);
    await this.write(`${'='.repeat(50)}\n`);
  }

  async write(message: string): Promise<void> {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;

    this.buffer.push(line);

    if (this.logPath) {
      try {
        await fs.appendFile(this.logPath, line);
      } catch {
        // Ignore write errors
      }
    }
  }

  async info(message: string): Promise<void> {
    await this.write(`[INFO] ${message}`);
  }

  async warn(message: string): Promise<void> {
    await this.write(`[WARN] ${message}`);
  }

  async error(message: string): Promise<void> {
    await this.write(`[ERROR] ${message}`);
  }

  async debug(message: string): Promise<void> {
    await this.write(`[DEBUG] ${message}`);
  }

  async logCommand(command: string, args: string[]): Promise<void> {
    await this.write(`[CMD] ${command} ${args.join(' ')}`);
  }

  async logOutput(output: string): Promise<void> {
    if (output.trim()) {
      await this.write(`[OUTPUT]\n${output}`);
    }
  }

  async section(title: string): Promise<void> {
    await this.write(`\n--- ${title} ---`);
  }

  async close(): Promise<void> {
    if (!this.enabled) return;

    await this.write(`\n${'='.repeat(50)}`);
    await this.write(`Finished: ${new Date().toISOString()}`);
    await this.write(`=== End of Log ===`);
  }

  getLogPath(): string | null {
    return this.logPath;
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function createLogger(devMode: boolean): Logger {
  globalLogger = new Logger(devMode);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(false);
  }
  return globalLogger;
}
