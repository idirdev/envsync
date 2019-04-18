#!/usr/bin/env node
'use strict';

/**
 * @file bin/cli.js
 * @description CLI for envsync — compare and sync .env files.
 * @author idirdev
 */

const { parseEnv, diffEnv, validateEnv, syncEnv, formatDiff, summary } = require('../src/index.js');

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log('Usage:');
  console.log('  envsync diff <fileA> <fileB>');
  console.log('  envsync validate <file> --required VAR1,VAR2');
  console.log('  envsync sync <source> <target>');
}

if (!command) {
  printUsage();
  process.exit(1);
}

switch (command) {
  case 'diff': {
    const [, fileA, fileB] = args;
    if (!fileA || !fileB) {
      console.error('Error: diff requires two file paths.');
      process.exit(1);
    }
    const diff = diffEnv(fileA, fileB);
    console.log(formatDiff(diff));
    console.log('');
    console.log('Summary:', summary(diff));
    break;
  }

  case 'validate': {
    const [, filePath] = args;
    if (!filePath) {
      console.error('Error: validate requires a file path.');
      process.exit(1);
    }
    const reqIdx = args.indexOf('--required');
    const required = reqIdx !== -1 && args[reqIdx + 1]
      ? args[reqIdx + 1].split(',').map((s) => s.trim())
      : [];
    const result = validateEnv(filePath, { required });
    if (result.valid) {
      console.log('Validation passed.');
    } else {
      console.error('Validation failed:');
      result.errors.forEach((e) => console.error(`  ${e}`));
      process.exit(1);
    }
    break;
  }

  case 'sync': {
    const [, source, target] = args;
    if (!source || !target) {
      console.error('Error: sync requires source and target file paths.');
      process.exit(1);
    }
    const added = syncEnv(source, target);
    if (added.length === 0) {
      console.log('Nothing to sync — target is already up to date.');
    } else {
      console.log(`Synced ${added.length} variable(s): ${added.join(', ')}`);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
