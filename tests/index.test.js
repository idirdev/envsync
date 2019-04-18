'use strict';

/**
 * @file tests/index.test.js
 * @description Tests for envsync.
 * @author idirdev
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseEnv,
  diffEnv,
  validateEnv,
  syncEnv,
  findDuplicates,
  formatDiff,
  summary,
} = require('../src/index.js');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envsync-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

describe('parseEnv', () => {
  it('parses simple key=value lines', () => {
    const f = write('simple.env', 'FOO=bar\nBAZ=123\n');
    const vars = parseEnv(f);
    assert.equal(vars['FOO'], 'bar');
    assert.equal(vars['BAZ'], '123');
  });

  it('ignores comments and blank lines', () => {
    const f = write('comments.env', '# comment\n\nFOO=bar\n');
    const vars = parseEnv(f);
    assert.deepEqual(Object.keys(vars), ['FOO']);
  });

  it('strips double quotes from values', () => {
    const f = write('quoted.env', 'MSG="hello world"\n');
    const vars = parseEnv(f);
    assert.equal(vars['MSG'], 'hello world');
  });

  it('strips single quotes from values', () => {
    const f = write('sq.env', "MSG='hello'\n");
    const vars = parseEnv(f);
    assert.equal(vars['MSG'], 'hello');
  });

  it('strips export prefix', () => {
    const f = write('export.env', 'export FOO=bar\n');
    const vars = parseEnv(f);
    assert.equal(vars['FOO'], 'bar');
  });
});

describe('diffEnv', () => {
  it('finds missing and extra keys', () => {
    const a = write('diff-a.env', 'FOO=1\nBAR=2\n');
    const b = write('diff-b.env', 'FOO=1\nBAZ=3\n');
    const diff = diffEnv(a, b);
    assert.ok(diff.missing.includes('BAR'));
    assert.ok(diff.extra.includes('BAZ'));
    assert.ok(diff.common.includes('FOO'));
  });

  it('detects changed values', () => {
    const a = write('changed-a.env', 'KEY=old\n');
    const b = write('changed-b.env', 'KEY=new\n');
    const diff = diffEnv(a, b);
    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0].key, 'KEY');
    assert.equal(diff.changed[0].valueA, 'old');
    assert.equal(diff.changed[0].valueB, 'new');
  });

  it('returns empty arrays when identical', () => {
    const a = write('same-a.env', 'X=1\n');
    const b = write('same-b.env', 'X=1\n');
    const diff = diffEnv(a, b);
    assert.equal(diff.missing.length, 0);
    assert.equal(diff.extra.length, 0);
    assert.equal(diff.changed.length, 0);
  });
});

describe('validateEnv', () => {
  it('passes when all required vars present', () => {
    const f = write('valid.env', 'FOO=bar\nBAR=baz\n');
    const result = validateEnv(f, { required: ['FOO', 'BAR'] });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('fails when required var missing', () => {
    const f = write('missing.env', 'FOO=bar\n');
    const result = validateEnv(f, { required: ['BAR'] });
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
  });

  it('validates number type', () => {
    const f = write('numtype.env', 'PORT=abc\n');
    const result = validateEnv(f, { types: { PORT: 'number' } });
    assert.equal(result.valid, false);
  });

  it('validates url type', () => {
    const f = write('urltype.env', 'API_URL=not-a-url\n');
    const result = validateEnv(f, { types: { API_URL: 'url' } });
    assert.equal(result.valid, false);
  });
});

describe('findDuplicates', () => {
  it('finds duplicate keys', () => {
    const f = write('dups.env', 'FOO=1\nFOO=2\nBAR=3\n');
    const dups = findDuplicates(f);
    assert.equal(dups.length, 1);
    assert.equal(dups[0].key, 'FOO');
    assert.equal(dups[0].count, 2);
  });

  it('returns empty when no duplicates', () => {
    const f = write('nodups.env', 'FOO=1\nBAR=2\n');
    const dups = findDuplicates(f);
    assert.equal(dups.length, 0);
  });
});

describe('syncEnv', () => {
  it('adds missing vars from source to target', () => {
    const src = write('sync-src.env', 'FOO=1\nBAR=2\n');
    const tgt = write('sync-tgt.env', 'FOO=1\n');
    const added = syncEnv(src, tgt);
    assert.ok(added.includes('BAR'));
    const tgtContent = fs.readFileSync(tgt, 'utf8');
    assert.ok(tgtContent.includes('BAR=2'));
  });

  it('returns empty array when already in sync', () => {
    const src = write('sync-same-src.env', 'FOO=1\n');
    const tgt = write('sync-same-tgt.env', 'FOO=1\n');
    const added = syncEnv(src, tgt);
    assert.equal(added.length, 0);
  });
});

describe('formatDiff', () => {
  it('returns "Files are identical." for empty diff', () => {
    const result = formatDiff({ missing: [], extra: [], changed: [] });
    assert.ok(result.includes('identical'));
  });
});

describe('summary', () => {
  it('returns correct summary string', () => {
    const diff = { missing: ['A'], extra: [], common: [], changed: [] };
    const s = summary(diff);
    assert.ok(s.includes('1 missing'));
  });

  it('returns no-differences message for identical', () => {
    const s = summary({ missing: [], extra: [], common: ['X'], changed: [] });
    assert.ok(s.includes('No differences'));
  });
});
