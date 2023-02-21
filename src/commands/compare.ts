import chalk from 'chalk';
import { parseEnvFile, activeEntries } from '../utils/parser';
import { computeDiff, formatDiffEntry, diffHeader, diffSummary, DiffEntry } from '../utils/diff';

interface CompareOptions {
  values?: boolean;
  keysOnly?: boolean;
  json?: boolean;
}

export async function compareCommand(
  file1: string,
  file2: string,
  options: CompareOptions
): Promise<void> {
  const left = parseEnvFile(file1);
  const right = parseEnvFile(file2);

  // Report parse errors
  if (left.errors.length > 0) {
    console.log(chalk.yellow(`\n  Warnings in ${file1}:`));
    for (const err of left.errors) {
      console.log(chalk.yellow(`    ${err}`));
    }
  }
  if (right.errors.length > 0) {
    console.log(chalk.yellow(`\n  Warnings in ${file2}:`));
    for (const err of right.errors) {
      console.log(chalk.yellow(`    ${err}`));
    }
  }

  const leftActive = activeEntries(left.entries);
  const rightActive = activeEntries(right.entries);
  const diffs = computeDiff(leftActive, rightActive);
  const summary = diffSummary(diffs);

  if (options.json) {
    console.log(JSON.stringify({
      left: { file: left.path, variables: leftActive.length },
      right: { file: right.path, variables: rightActive.length },
      summary,
      differences: diffs
        .filter((d) => d.type !== 'unchanged')
        .map((d) => ({
          key: d.key,
          type: d.type,
          leftValue: options.values ? d.leftValue : undefined,
          rightValue: options.values ? d.rightValue : undefined,
        })),
    }, null, 2));
    return;
  }

  // Banner
  console.log();
  console.log(chalk.bold.cyan('  EnvSync') + chalk.dim(' - Compare'));
  console.log(chalk.dim('  ' + '-'.repeat(40)));
  console.log();

  // File info
  console.log(`  ${chalk.dim('Left:')}  ${chalk.white(left.path)} ${chalk.dim(`(${leftActive.length} variables)`)}`);
  console.log(`  ${chalk.dim('Right:')} ${chalk.white(right.path)} ${chalk.dim(`(${rightActive.length} variables)`)}`);
  console.log();

  // Summary
  console.log(chalk.bold.underline('  Summary'));
  console.log();

  const summaryItems = [
    { label: 'Total keys', value: String(summary.total), color: chalk.white },
    { label: 'Unchanged', value: String(summary.unchanged), color: chalk.dim },
    { label: 'Modified', value: String(summary.modified), color: summary.modified > 0 ? chalk.yellow : chalk.dim },
    { label: 'Added (right only)', value: String(summary.added), color: summary.added > 0 ? chalk.green : chalk.dim },
    { label: 'Removed (left only)', value: String(summary.removed), color: summary.removed > 0 ? chalk.red : chalk.dim },
  ];

  const maxLabel = Math.max(...summaryItems.map((s) => s.label.length));
  for (const item of summaryItems) {
    console.log(`  ${chalk.dim(item.label.padEnd(maxLabel + 2))}${item.color(item.value)}`);
  }

  // If no differences, say so and exit
  if (summary.added === 0 && summary.removed === 0 && summary.modified === 0) {
    console.log();
    console.log(chalk.green('  Files are identical (all keys and values match).'));
    console.log();
    return;
  }

  // Diff header
  console.log();
  console.log(diffHeader(left.path, right.path));
  console.log();

  // Show differences grouped by type
  const modified = diffs.filter((d) => d.type === 'modified');
  const added = diffs.filter((d) => d.type === 'added');
  const removed = diffs.filter((d) => d.type === 'removed');

  if (modified.length > 0) {
    console.log(chalk.bold.yellow(`  Modified (${modified.length}):`));
    for (const entry of modified) {
      console.log(formatDiffEntry(entry, options.values));
    }
    console.log();
  }

  if (added.length > 0) {
    console.log(chalk.bold.green(`  Added in ${file2} (${added.length}):`));
    for (const entry of added) {
      console.log(formatDiffEntry(entry, options.values));
    }
    console.log();
  }

  if (removed.length > 0) {
    console.log(chalk.bold.red(`  Only in ${file1} (${removed.length}):`));
    for (const entry of removed) {
      console.log(formatDiffEntry(entry, options.values));
    }
    console.log();
  }

  // Show unchanged if --keys-only (for completeness)
  if (options.keysOnly) {
    const unchanged = diffs.filter((d) => d.type === 'unchanged');
    if (unchanged.length > 0) {
      console.log(chalk.dim(`  Unchanged (${unchanged.length}):`));
      for (const entry of unchanged) {
        console.log(chalk.dim(`    ${entry.key}`));
      }
      console.log();
    }
  }
}
