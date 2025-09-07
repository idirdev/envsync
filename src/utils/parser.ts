import * as fs from 'fs';
import * as path from 'path';

export interface EnvEntry {
  key: string;
  value: string;
  comment: string | null;
  lineNumber: number;
  isCommented: boolean;
  rawLine: string;
}

export interface EnvFile {
  path: string;
  entries: EnvEntry[];
  comments: string[];
  errors: string[];
}

/**
 * Parse a .env file into structured entries.
 * Handles:
 *   - KEY=VALUE pairs
 *   - Quoted values (single, double)
 *   - Inline comments (# after value)
 *   - Multi-line values (not supported -- single line only)
 *   - Commented-out variables (# KEY=VALUE)
 *   - Empty lines and standalone comments
 */
export function parseEnvFile(filePath: string): EnvFile {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = content.split('\n');
  const entries: EnvEntry[] = [];
  const comments: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const lineNumber = i + 1;

    // Empty line
    if (trimmed === '') continue;

    // Standalone comment
    if (trimmed.startsWith('#') && !trimmed.match(/^#\s*\w+\s*=/)) {
      comments.push(trimmed);
      continue;
    }

    // Commented-out variable: # KEY=VALUE
    if (trimmed.startsWith('#') && trimmed.match(/^#\s*\w+\s*=/)) {
      const uncommented = trimmed.replace(/^#\s*/, '');
      const parsed = parseKeyValue(uncommented);
      if (parsed) {
        entries.push({
          key: parsed.key,
          value: parsed.value,
          comment: parsed.comment,
          lineNumber,
          isCommented: true,
          rawLine,
        });
      }
      continue;
    }

    // Regular KEY=VALUE line
    const parsed = parseKeyValue(trimmed);
    if (parsed) {
      entries.push({
        key: parsed.key,
        value: parsed.value,
        comment: parsed.comment,
        lineNumber,
        isCommented: false,
        rawLine,
      });
    } else if (trimmed.includes('=')) {
      errors.push(`Line ${lineNumber}: Malformed entry: ${trimmed.slice(0, 60)}`);
    }
  }

  return { path: resolvedPath, entries, comments, errors };
}

/**
 * Parse a single KEY=VALUE string.
 */
function parseKeyValue(line: string): { key: string; value: string; comment: string | null } | null {
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) return null;

  const key = line.slice(0, eqIndex).trim();
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let rest = line.slice(eqIndex + 1);
  let value: string;
  let comment: string | null = null;

  // Handle quoted values
  if (rest.startsWith('"')) {
    const endQuote = rest.indexOf('"', 1);
    if (endQuote !== -1) {
      value = rest.slice(1, endQuote);
      const afterQuote = rest.slice(endQuote + 1).trim();
      if (afterQuote.startsWith('#')) {
        comment = afterQuote.slice(1).trim();
      }
    } else {
      value = rest.slice(1); // unclosed quote
    }
  } else if (rest.startsWith("'")) {
    const endQuote = rest.indexOf("'", 1);
    if (endQuote !== -1) {
      value = rest.slice(1, endQuote);
      const afterQuote = rest.slice(endQuote + 1).trim();
      if (afterQuote.startsWith('#')) {
        comment = afterQuote.slice(1).trim();
      }
    } else {
      value = rest.slice(1); // unclosed quote
    }
  } else {
    // Unquoted value -- stop at inline comment
    const hashIndex = rest.indexOf(' #');
    if (hashIndex !== -1) {
      value = rest.slice(0, hashIndex).trim();
      comment = rest.slice(hashIndex + 2).trim();
    } else {
      value = rest.trim();
    }
  }

  return { key, value, comment };
}

/**
 * Convert entries back to .env file string format.
 */
export function entriesToString(entries: EnvEntry[], includeComments: boolean = true): string {
  const lines: string[] = [];

  for (const entry of entries) {
    if (entry.isCommented) {
      lines.push(`# ${entry.key}=${formatValue(entry.value)}${entry.comment ? ` # ${entry.comment}` : ''}`);
    } else {
      const commentSuffix = includeComments && entry.comment ? ` # ${entry.comment}` : '';
      lines.push(`${entry.key}=${formatValue(entry.value)}${commentSuffix}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Format a value, adding quotes if necessary.
 */
function formatValue(value: string): string {
  if (value === '') return '';
  if (value.includes(' ') || value.includes('#') || value.includes('"') || value.includes("'")) {
    // Use double quotes, escaping internal double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Build a Map<key, EnvEntry> from entries.
 */
export function entriesToMap(entries: EnvEntry[]): Map<string, EnvEntry> {
  const map = new Map<string, EnvEntry>();
  for (const entry of entries) {
    if (!entry.isCommented) {
      map.set(entry.key, entry);
    }
  }
  return map;
}

/**
 * Get only active (non-commented) entries.
 */
export function activeEntries(entries: EnvEntry[]): EnvEntry[] {
  return entries.filter((e) => !e.isCommented);
}

/**
 * Extract the previous comment line (useful for templates).
 * Returns the comment from the entry itself or null.
 */
export function getEntryDescription(entry: EnvEntry, allComments: string[], entries: EnvEntry[]): string | null {
  if (entry.comment) return entry.comment;

  // Look for a comment on the line above
  const idx = entries.indexOf(entry);
  if (idx > 0) {
    const prev = entries[idx - 1];
    if (prev.isCommented && prev.comment) return prev.comment;
  }

  return null;
}
