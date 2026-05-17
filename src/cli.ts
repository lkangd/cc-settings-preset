#!/usr/bin/env node
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

if (require.main === module) {
  main();
}
