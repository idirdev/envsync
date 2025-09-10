import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { parseEnvFile, activeEntries, entriesToString } from '../utils/parser';
import { mergeEntries, formatDiffEntry, diffSummary, computeDiff, maskValue } from '../utils/diff';

interface MergeOptions {
  output?: string;
  strategy?: 'override' | 'keep' | 'ask' | 'comment';
  backup?: boolean;
  json?: boolean;
}

export async function mergeCommand(
  baseFile: string,
  overrideFile: string,
  options: MergeOptions
): Promise<void> {
  const base = parseEnvFile(baseFile);
  const override = parseEnvFile(overrideFile);

  const strategy = (options.strategy || 'override') as 'override' | 'keep' | 'comment';

  // 'ask' strategy falls back to 'comment' in non-interactive mode
  const effectiveStrategy = strategy === ('ask' as any) ? 'comment' : strategy;

  const baseActive = activeEntries(base.entries);
  const overrideActive = activeEntries(override.entries);

  // Compute the merge
  const { merged, conflicts } = mergeEntries(baseActive, overrideActive, effectiveStrategy);

  // Compute overall diff for summary
  const diffs = computeDiff(baseActive, overrideActive);
  const summary = diffSummary(diffs);

  // Generate output content
  const header = [
    `# Merged env file`,
    `# Base: ${base.path}`,
    `# Override: ${override.path}`,
    `# Strategy: ${effectiveStrategy}`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
  ].join('\n');

  const content = header + entriesToString(merged);

  if (options.json) {
    console.log(JSON.stringify({
      baseFile: base.path,
      overrideFile: override.path,
      strategy: effectiveStrategy,
      summary: {
        baseVariables: baseActive.length,
        overrideVariables: overrideActive.length,
        mergedVariables: merged.filter((e) => !e.isCommented).length,
        conflicts: conflicts.length,
        added: summary.added,
        removed: summary.removed,
        modified: summary.modified,
        unchanged: summary.unchanged,
      },
      conflicts: conflicts.map((c) => ({
        key: c.key,
        baseValue: maskValue(c.leftValue),
        overrideValue: maskValue(c.rightValue),
        resolution: effectiveStrategy,
      })),
      output: content,
    }, null, 2));
    return;
  }

  // Banner
  console.log();
  console.log(chalk.bold.cyan('  EnvSync') + chalk.dim(' - Merge'));
  console.log(chalk.dim('  ' + '-'.repeat(40)));
  console.log();

  // File info
  console.log(`  ${chalk.dim('Base:')}      ${chalk.white(base.path)} ${chalk.dim(`(${baseActive.length} variables)`)}`);
  console.log(`  ${chalk.dim('Override:')}  ${chalk.white(override.path)} ${chalk.dim(`(${overrideActive.length} variables)`)}`);
  console.log(`  ${chalk.dim('Strategy:')}  ${chalk.yellow(effectiveStrategy)}`);
  console.log();

  // Summary
  console.log(chalk.bold.underline('  Merge Summary'));
  console.log();

  const summaryItems = [
    { label: 'Variables in base', value: String(baseActive.length), color: chalk.white },
    { label: 'Variables in override', value: String(overrideActive.length), color: chalk.white },
    { label: 'Merged result', value: String(merged.filter((e) => !e.isCommented).length), color: chalk.cyan },
    { label: 'Conflicts resolved', value: String(conflicts.length), color: conflicts.length > 0 ? chalk.yellow : chalk.dim },
    { label: 'New from override', value: String(summary.added), color: summary.added > 0 ? chalk.green : chalk.dim },
    { label: 'Unchanged', value: String(summary.unchanged), color: chalk.dim },
  ];

  const maxLabel = Math.max(...summaryItems.map((s) => s.label.length));
  for (const item of summaryItems) {
    console.log(`  ${chalk.dim(item.label.padEnd(maxLabel + 2))}${item.color(item.value)}`);
  }

  // Conflict details
  if (conflicts.length > 0) {
    console.log();
    console.log(chalk.bold.yellow(`  Conflicts (${conflicts.length}):`));
    console.log();

    for (const conflict of conflicts) {
      console.log(`  ${chalk.yellow('\u26A0')} ${chalk.white(conflict.key)}`);
      console.log(`    ${chalk.dim('Base:')}     ${chalk.red(maskValue(conflict.leftValue))}`);
      console.log(`    ${chalk.dim('Override:')} ${chalk.green(maskValue(conflict.rightValue))}`);

      switch (effectiveStrategy) {
        case 'override':
          console.log(`    ${chalk.dim('Resolved:')} ${chalk.green('using override value')}`);
          break;
        case 'keep':
          console.log(`    ${chalk.dim('Resolved:')} ${chalk.cyan('keeping base value')}`);
          break;
        case 'comment':
          console.log(`    ${chalk.dim('Resolved:')} ${chalk.yellow('base kept, override commented')}`);
          break;
      }
      console.log();
    }
  }

  // Write output
  if (options.output) {
    const outputPath = path.resolve(options.output);

    // Backup existing file
    if (options.backup && fs.existsSync(outputPath)) {
      const backupPath = outputPath + '.bak';
      fs.copyFileSync(outputPath, backupPath);
      console.log(chalk.dim(`  Backup created: ${backupPath}`));
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(chalk.green(`  ${'\u2714'} Merged output written to: ${outputPath}`));
    console.log(chalk.dim(`    ${merged.filter((e) => !e.isCommented).length} variables, ${conflicts.length} conflicts resolved`));
  } else {
    // Print to stdout
    console.log(chalk.bold.underline('  Output'));
    console.log();
    console.log(chalk.dim('  ---'));
    for (const line of content.split('\n')) {
      console.log(`  ${chalk.white(line)}`);
    }
    console.log(chalk.dim('  ---'));
  }

  console.log();
}
