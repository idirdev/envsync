import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseEnvFile,
  entriesToString,
  entriesToMap,
  activeEntries,
  EnvEntry,
} from '../src/utils/parser';
import {
  computeDiff,
  diffSummary,
  maskValue,
  areEqual,
  mergeEntries,
} from '../src/utils/diff';

// Helper to create a temp .env file for testing
function createTempEnv(content: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.env`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ─── Parser ───

describe('parseEnvFile', () => {
  it('should parse simple KEY=VALUE pairs', () => {
    const file = createTempEnv('DB_HOST=localhost\nDB_PORT=5432\n');
    const result = parseEnvFile(file);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].key).toBe('DB_HOST');
    expect(result.entries[0].value).toBe('localhost');
    expect(result.entries[1].key).toBe('DB_PORT');
    expect(result.entries[1].value).toBe('5432');
    expect(result.errors).toHaveLength(0);

    fs.unlinkSync(file);
  });

  it('should handle double-quoted values', () => {
    const file = createTempEnv('GREETING="Hello World"\n');
    const result = parseEnvFile(file);

    expect(result.entries[0].key).toBe('GREETING');
    expect(result.entries[0].value).toBe('Hello World');

    fs.unlinkSync(file);
  });

  it('should handle single-quoted values', () => {
    const file = createTempEnv("SECRET='my secret'\n");
    const result = parseEnvFile(file);

    expect(result.entries[0].value).toBe('my secret');

    fs.unlinkSync(file);
  });

  it('should handle inline comments', () => {
    const file = createTempEnv('API_KEY=abc123 # my api key\n');
    const result = parseEnvFile(file);

    expect(result.entries[0].key).toBe('API_KEY');
    expect(result.entries[0].value).toBe('abc123');
    expect(result.entries[0].comment).toBe('my api key');

    fs.unlinkSync(file);
  });

  it('should detect commented-out variables', () => {
    const file = createTempEnv('# DB_HOST=old-host\nDB_HOST=new-host\n');
    const result = parseEnvFile(file);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].isCommented).toBe(true);
    expect(result.entries[0].key).toBe('DB_HOST');
    expect(result.entries[0].value).toBe('old-host');
    expect(result.entries[1].isCommented).toBe(false);

    fs.unlinkSync(file);
  });

  it('should skip empty lines', () => {
    const file = createTempEnv('\n\nKEY=value\n\n');
    const result = parseEnvFile(file);

    expect(result.entries).toHaveLength(1);

    fs.unlinkSync(file);
  });

  it('should collect standalone comments', () => {
    const file = createTempEnv('# This is a comment\nKEY=val\n');
    const result = parseEnvFile(file);

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toBe('# This is a comment');

    fs.unlinkSync(file);
  });

  it('should throw for non-existent file', () => {
    expect(() => parseEnvFile('/nonexistent/path/.env')).toThrow('File not found');
  });

  it('should track line numbers', () => {
    const file = createTempEnv('\nA=1\n\nB=2\n');
    const result = parseEnvFile(file);

    expect(result.entries[0].lineNumber).toBe(2);
    expect(result.entries[1].lineNumber).toBe(4);

    fs.unlinkSync(file);
  });
});

describe('entriesToString', () => {
  it('should serialize entries back to env format', () => {
    const entries: EnvEntry[] = [
      { key: 'A', value: '1', comment: null, lineNumber: 1, isCommented: false, rawLine: 'A=1' },
      { key: 'B', value: 'hello world', comment: 'greeting', lineNumber: 2, isCommented: false, rawLine: 'B="hello world" # greeting' },
    ];

    const result = entriesToString(entries);
    expect(result).toContain('A=1');
    expect(result).toContain('B="hello world" # greeting');
  });

  it('should serialize commented-out entries with # prefix', () => {
    const entries: EnvEntry[] = [
      { key: 'OLD', value: 'val', comment: null, lineNumber: 1, isCommented: true, rawLine: '# OLD=val' },
    ];

    const result = entriesToString(entries);
    expect(result).toContain('# OLD=val');
  });
});

describe('entriesToMap', () => {
  it('should create a map of active entries only', () => {
    const entries: EnvEntry[] = [
      { key: 'A', value: '1', comment: null, lineNumber: 1, isCommented: false, rawLine: 'A=1' },
      { key: 'B', value: '2', comment: null, lineNumber: 2, isCommented: true, rawLine: '# B=2' },
      { key: 'C', value: '3', comment: null, lineNumber: 3, isCommented: false, rawLine: 'C=3' },
    ];

    const map = entriesToMap(entries);
    expect(map.size).toBe(2);
    expect(map.has('A')).toBe(true);
    expect(map.has('B')).toBe(false);
    expect(map.has('C')).toBe(true);
  });
});

describe('activeEntries', () => {
  it('should filter out commented entries', () => {
    const entries: EnvEntry[] = [
      { key: 'A', value: '1', comment: null, lineNumber: 1, isCommented: false, rawLine: 'A=1' },
      { key: 'B', value: '2', comment: null, lineNumber: 2, isCommented: true, rawLine: '# B=2' },
    ];

    const active = activeEntries(entries);
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe('A');
  });
});

// ─── Diff ───

describe('computeDiff', () => {
  function makeEntry(key: string, value: string): EnvEntry {
    return { key, value, comment: null, lineNumber: 1, isCommented: false, rawLine: `${key}=${value}` };
  }

  it('should detect unchanged entries', () => {
    const left = [makeEntry('A', '1')];
    const right = [makeEntry('A', '1')];
    const diffs = computeDiff(left, right);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('unchanged');
  });

  it('should detect modified entries', () => {
    const left = [makeEntry('A', '1')];
    const right = [makeEntry('A', '2')];
    const diffs = computeDiff(left, right);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('modified');
    expect(diffs[0].leftValue).toBe('1');
    expect(diffs[0].rightValue).toBe('2');
  });

  it('should detect added entries (right only)', () => {
    const left: EnvEntry[] = [];
    const right = [makeEntry('NEW', 'val')];
    const diffs = computeDiff(left, right);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('added');
  });

  it('should detect removed entries (left only)', () => {
    const left = [makeEntry('OLD', 'val')];
    const right: EnvEntry[] = [];
    const diffs = computeDiff(left, right);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('removed');
  });
});

describe('diffSummary', () => {
  it('should count types correctly', () => {
    const diffs = [
      { key: 'A', type: 'unchanged' as const, leftValue: '1', rightValue: '1', leftComment: null, rightComment: null },
      { key: 'B', type: 'modified' as const, leftValue: '1', rightValue: '2', leftComment: null, rightComment: null },
      { key: 'C', type: 'added' as const, leftValue: null, rightValue: '3', leftComment: null, rightComment: null },
      { key: 'D', type: 'removed' as const, leftValue: '4', rightValue: null, leftComment: null, rightComment: null },
    ];

    const summary = diffSummary(diffs);
    expect(summary.total).toBe(4);
    expect(summary.unchanged).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
  });
});

describe('maskValue', () => {
  it('should return "(not set)" for null', () => {
    expect(maskValue(null)).toBe('(not set)');
  });

  it('should return "(empty)" for empty string', () => {
    expect(maskValue('')).toBe('(empty)');
  });

  it('should mask short values completely', () => {
    expect(maskValue('abc')).toBe('****');
  });

  it('should show first and last 2 chars for longer values', () => {
    const masked = maskValue('abcdefgh');
    expect(masked.startsWith('ab')).toBe(true);
    expect(masked.endsWith('gh')).toBe(true);
    expect(masked).toContain('*');
  });
});

describe('areEqual', () => {
  function makeEntry(key: string, value: string): EnvEntry {
    return { key, value, comment: null, lineNumber: 1, isCommented: false, rawLine: `${key}=${value}` };
  }

  it('should return true for identical sets', () => {
    const entries = [makeEntry('A', '1'), makeEntry('B', '2')];
    expect(areEqual(entries, entries)).toBe(true);
  });

  it('should return false for different sets', () => {
    const left = [makeEntry('A', '1')];
    const right = [makeEntry('A', '2')];
    expect(areEqual(left, right)).toBe(false);
  });
});

describe('mergeEntries', () => {
  function makeEntry(key: string, value: string): EnvEntry {
    return { key, value, comment: null, lineNumber: 1, isCommented: false, rawLine: `${key}=${value}` };
  }

  it('should merge with "override" strategy', () => {
    const base = [makeEntry('A', '1')];
    const override = [makeEntry('A', '2')];
    const { merged, conflicts } = mergeEntries(base, override, 'override');

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('2');
    expect(conflicts).toHaveLength(1);
  });

  it('should merge with "keep" strategy', () => {
    const base = [makeEntry('A', '1')];
    const override = [makeEntry('A', '2')];
    const { merged } = mergeEntries(base, override, 'keep');

    expect(merged[0].value).toBe('1');
  });

  it('should add entries from override that are not in base', () => {
    const base = [makeEntry('A', '1')];
    const override = [makeEntry('B', '2')];
    const { merged } = mergeEntries(base, override, 'override');

    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.key === 'B')).toBeDefined();
  });

  it('should report no conflicts when values match', () => {
    const base = [makeEntry('A', '1')];
    const override = [makeEntry('A', '1')];
    const { conflicts } = mergeEntries(base, override, 'override');

    expect(conflicts).toHaveLength(0);
  });
});
