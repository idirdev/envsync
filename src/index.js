'use strict';

/**
 * @module envsync
 * @description Compare and sync .env files to find missing variables.
 * @author idirdev
 */

const fs = require('fs');

/**
 * Parse a .env file into a key-value map.
 * Handles: comments, blank lines, quoted values, multiline (basic), export prefix.
 *
 * @param {string} filePath - Path to the .env file.
 * @returns {Record<string, string>}
 */
function parseEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const result = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Strip optional export prefix
    const stripped = trimmed.replace(/^export\s+/, '');

    const eqIdx = stripped.indexOf('=');
    if (eqIdx === -1) continue;

    const key = stripped.slice(0, eqIdx).trim();
    let value = stripped.slice(eqIdx + 1);

    // Remove surrounding double quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    // Remove surrounding single quotes
    else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/**
 * Compare two .env key-value maps and return a diff descriptor.
 *
 * @param {string} fileA - Path to the reference .env file.
 * @param {string} fileB - Path to the comparison .env file.
 * @returns {{ missing: string[], extra: string[], common: string[], changed: { key: string, valueA: string, valueB: string }[] }}
 */
function diffEnv(fileA, fileB) {
  const a = parseEnv(fileA);
  const b = parseEnv(fileB);
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));

  const missing = [...keysA].filter((k) => !keysB.has(k));
  const extra = [...keysB].filter((k) => !keysA.has(k));
  const common = [...keysA].filter((k) => keysB.has(k));
  const changed = common
    .filter((k) => a[k] !== b[k])
    .map((k) => ({ key: k, valueA: a[k], valueB: b[k] }));

  return { missing, extra, common, changed };
}

/**
 * Validate a .env file against required keys and optional type rules.
 *
 * @param {string} filePath - Path to the .env file.
 * @param {{ required?: string[], types?: Record<string,'string'|'number'|'boolean'|'url'|'email'> }} [opts={}]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEnv(filePath, opts) {
  const options = opts || {};
  const required = options.required || [];
  const types = options.types || {};
  const vars = parseEnv(filePath);
  const errors = [];

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(vars, key) || vars[key] === '') {
      errors.push(`Missing required variable: ${key}`);
    }
  }

  for (const [key, type] of Object.entries(types)) {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) continue;
    const value = vars[key];

    switch (type) {
      case 'number':
        if (isNaN(Number(value)) || value.trim() === '') {
          errors.push(`${key} must be a number, got: "${value}"`);
        }
        break;
      case 'boolean':
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase())) {
          errors.push(`${key} must be a boolean, got: "${value}"`);
        }
        break;
      case 'url':
        try {
          new URL(value);
        } catch {
          errors.push(`${key} must be a valid URL, got: "${value}"`);
        }
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`${key} must be a valid email, got: "${value}"`);
        }
        break;
      default:
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sync missing variables from source .env to target .env.
 * Appends missing keys with their values from the source file.
 *
 * @param {string} source - Path to the source .env file.
 * @param {string} target - Path to the target .env file.
 * @returns {string[]} List of keys that were added.
 */
function syncEnv(source, target) {
  const sourceVars = parseEnv(source);
  const targetVars = parseEnv(target);
  const added = [];
  const lines = [];

  for (const [key, value] of Object.entries(sourceVars)) {
    if (!Object.prototype.hasOwnProperty.call(targetVars, key)) {
      lines.push(`${key}=${value}`);
      added.push(key);
    }
  }

  if (lines.length > 0) {
    const existing = fs.readFileSync(target, 'utf8');
    const separator = existing.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(target, existing + separator + lines.join('\n') + '\n', 'utf8');
  }

  return added;
}

/**
 * Find duplicate keys within a single .env file.
 *
 * @param {string} filePath
 * @returns {{ key: string, count: number }[]}
 */
function findDuplicates(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const counts = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const stripped = trimmed.replace(/^export\s+/, '');
    const eqIdx = stripped.indexOf('=');
    if (eqIdx === -1) continue;
    const key = stripped.slice(0, eqIdx).trim();
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Format a diff result as a human-readable string.
 *
 * @param {{ missing: string[], extra: string[], changed: { key: string, valueA: string, valueB: string }[] }} diff
 * @returns {string}
 */
function formatDiff(diff) {
  const lines = [];

  if (diff.missing.length > 0) {
    lines.push('Missing in B:');
    diff.missing.forEach((k) => lines.push(`  - ${k}`));
  }

  if (diff.extra.length > 0) {
    lines.push('Extra in B:');
    diff.extra.forEach((k) => lines.push(`  + ${k}`));
  }

  if (diff.changed.length > 0) {
    lines.push('Changed:');
    diff.changed.forEach(({ key, valueA, valueB }) => {
      lines.push(`  ~ ${key}: "${valueA}" → "${valueB}"`);
    });
  }

  if (lines.length === 0) lines.push('Files are identical.');

  return lines.join('\n');
}

/**
 * Return a brief summary of a diff result.
 *
 * @param {{ missing: string[], extra: string[], common: string[], changed: { key: string }[] }} diff
 * @returns {string}
 */
function summary(diff) {
  const parts = [];
  if (diff.missing.length) parts.push(`${diff.missing.length} missing`);
  if (diff.extra.length) parts.push(`${diff.extra.length} extra`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  if (!parts.length) return 'No differences found.';
  return parts.join(', ') + '.';
}

module.exports = {
  parseEnv,
  diffEnv,
  validateEnv,
  syncEnv,
  findDuplicates,
  formatDiff,
  summary,
};
