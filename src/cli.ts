#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const VERSION = '1.0.0';

export function createProgram(): Command {
  return new Command()
    .name('cc-settings-preset')
    .description('Manage Claude Code settings presets')
    .version(VERSION);
}

export function main(argv = process.argv): void {
  createProgram().parse(argv);
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
