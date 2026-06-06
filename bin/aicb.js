#!/usr/bin/env node

/**
 * AI Code Brother CLI Entry Point
 * Uses tsx to run TypeScript directly (avoids bundling issues with SDK)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mainTs = join(__dirname, '..', 'src', 'main.ts');

// Forward all arguments to the TypeScript source via npx tsx
const child = spawn('npx', ['tsx', mainTs, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

