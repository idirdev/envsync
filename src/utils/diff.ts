import chalk from 'chalk';
import { EnvEntry, entriesToMap } from './parser';

export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface DiffEntry {
  key: string;
  type: DiffType;
  leftValue: string | null;
  rightValue: string | null;
  leftComment: string | null;
  rightComment: string | null;
}

/**
 * Compute the diff between two sets of env entries.
 * Left = "source/base", Right = "target/override".
 *
 * Returns an array of DiffEntry sorted by key.
 */
export function computeDiff(leftEntries: EnvEntry[], rightEntries: EnvEntry[]): DiffEntry[] {
  const leftMap = entriesToMap(leftEntries);
  const rightMap = entriesToMap(rightEntries);
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const results: DiffEntry[] = [];

  for (const key of allKeys) {
    const left = leftMap.get(key);
    const right = rightMap.get(key);

    if (left && right) {
      if (left.value === right.value) {
        results.push({
          key,
          type: 'unchanged',
          leftValue: left.value,
          rightValue: right.value,
          leftComment: left.comment,
          rightComment: right.comment,
        });
      } else {
        results.push({
          key,
          type: 'modified',
          leftValue: left.value,
          rightValue: right.value,
          leftComment: left.comment,
          rightComment: right.comment,
        });
      }
    } else if (left && !right) {
      results.push({
        key,
        type: 'removed',
        leftValue: left.value,
        rightValue: null,
        leftComment: left.comment,
        rightComment: null,
      });
    } else if (!left && right) {
      results.push({
        key,
        type: 'added',
        leftValue: null,
        rightValue: right.value,
        leftComment: null,
        rightComment: right.comment,
      });
    }
  }

  // Sort: modified first, then added, then removed, then unchanged
  const order: Record<DiffType, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  results.sort((a, b) => order[a.type] - order[b.type] || a.key.localeCompare(b.key));

  return results;
}

/**
 * Format a diff entry as a colored string for terminal display.
 */
export function formatDiffEntry(entry: DiffEntry, showValues: boolean = false): string {
  const maskedLeft = showValues ? entry.leftValue : maskValue(entry.leftValue);
  const maskedRight = showValues ? entry.rightValue : maskValue(entry.rightValue);

  switch (entry.type) {
    case 'added':
      return chalk.green(`  + ${entry.key}`) +
        (showValues ? chalk.green(` = ${maskedRight}`) : '');

    case 'removed':
      return chalk.red(`  - ${entry.key}`) +
        (showValues ? chalk.red(` = ${maskedLeft}`) : '');

    case 'modified':
      return chalk.yellow(`  ~ ${entry.key}`) +
        (showValues
          ? `\n      ${chalk.red(`- ${maskedLeft}`)}\n      ${chalk.green(`+ ${maskedRight}`)}`
          : chalk.dim(' (value changed)'));

    case 'unchanged':
      return chalk.dim(`    ${entry.key}`) +
        (showValues ? chalk.dim(` = ${maskedLeft}`) : '');

    default:
      return `  ? ${entry.key}`;
  }
}

/**
 * Mask a value for safe display (e.g., hide secrets).
 * Shows the first 2 and last 2 characters, masks the rest.
 */
export function maskValue(value: string | null): string {
  if (value === null) return '(not set)';
  if (value === '') return '(empty)';
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 20)) + value.slice(-2);
}

/**
 * Generate a unified diff header for display.
 */
export function diffHeader(leftPath: string, rightPath: string): string {
  return [
    chalk.bold('--- ') + chalk.red(leftPath),
    chalk.bold('+++ ') + chalk.green(rightPath),
    chalk.dim('='.repeat(60)),
  ].join('\n');
}

/**
 * Compute a summary of the diff.
 */
export function diffSummary(diffs: DiffEntry[]): {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  total: number;
} {
  const summary = { added: 0, removed: 0, modified: 0, unchanged: 0, total: diffs.length };
  for (const d of diffs) {
    summary[d.type]++;
  }
  return summary;
}

/**
 * Check if two env entry sets are equivalent (all keys match, all values match).
 */
export function areEqual(leftEntries: EnvEntry[], rightEntries: EnvEntry[]): boolean {
  const diffs = computeDiff(leftEntries, rightEntries);
  return diffs.every((d) => d.type === 'unchanged');
}

/**
 * Generate a merge result from two env entry sets using a given strategy.
 */
export function mergeEntries(
  base: EnvEntry[],
  override: EnvEntry[],
  strategy: 'override' | 'keep' | 'comment'
): { merged: EnvEntry[]; conflicts: DiffEntry[] } {
  const baseMap = entriesToMap(base);
  const overrideMap = entriesToMap(override);
  const allKeys = new Set([...baseMap.keys(), ...overrideMap.keys()]);
  const merged: EnvEntry[] = [];
  const conflicts: DiffEntry[] = [];

  // Preserve base ordering first
  const orderedKeys: string[] = [];
  const seen = new Set<string>();

  for (const entry of base) {
    if (!entry.isCommented && !seen.has(entry.key)) {
      orderedKeys.push(entry.key);
      seen.add(entry.key);
    }
  }
  for (const key of allKeys) {
    if (!seen.has(key)) {
      orderedKeys.push(key);
      seen.add(key);
    }
  }

  for (const key of orderedKeys) {
    const baseEntry = baseMap.get(key);
    const overrideEntry = overrideMap.get(key);

    if (baseEntry && overrideEntry) {
      if (baseEntry.value === overrideEntry.value) {
        // No conflict
        merged.push(baseEntry);
      } else {
        // Conflict
        conflicts.push({
          key,
          type: 'modified',
          leftValue: baseEntry.value,
          rightValue: overrideEntry.value,
          leftComment: baseEntry.comment,
          rightComment: overrideEntry.comment,
        });

        switch (strategy) {
          case 'override':
            merged.push({ ...overrideEntry, comment: overrideEntry.comment || baseEntry.comment });
            break;
          case 'keep':
            merged.push(baseEntry);
            break;
          case 'comment':
            // Keep base, add override as commented
            merged.push(baseEntry);
            merged.push({
              ...overrideEntry,
              isCommented: true,
              comment: `CONFLICT: override value was ${overrideEntry.value}`,
            });
            break;
        }
      }
    } else if (baseEntry) {
      merged.push(baseEntry);
    } else if (overrideEntry) {
      merged.push(overrideEntry);
    }
  }

  return { merged, conflicts };
}
