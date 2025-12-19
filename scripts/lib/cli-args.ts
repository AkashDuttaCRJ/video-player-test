import type { CLIArgs } from './types.js';

export function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    devMode: args.includes('-d') || args.includes('--dev'),
  };
}
