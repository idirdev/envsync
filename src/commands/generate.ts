import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import chalk from 'chalk';
import { parseEnvFile, activeEntries, EnvEntry } from '../utils/parser';

interface GenerateOptions {
  output?: string;
  defaults?: boolean;
  randomSecrets?: boolean;
  prefix?: string;
  json?: boolean;
}

/** Check if a variable name looks like a secret/key/token */
function isSecretKey(key: string): boolean {
  const secretPatterns = [
    'SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'PASSWD', 'PASS',
    'AUTH', 'PRIVATE', 'CREDENTIAL', 'API_KEY', 'ACCESS_KEY',
    'SIGNING', 'ENCRYPTION', 'HMAC', 'SALT', 'HASH',
  ];
  const upper = key.toUpperCase();
  return secretPatterns.some((pattern) => upper.includes(pattern));
}

/** Generate a random secret string */
function generateSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/** Generate a random hex string */
function generateHex(length: number = 32): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/** Detect the expected type and generate an appropriate placeholder */
function generatePlaceholder(key: string, templateValue: string): string {
  const upper = key.toUpperCase();

  // If template has a value, use it as default
  if (templateValue && templateValue.trim() !== '') {
    return templateValue;
  }

  // URL-like variables
  if (upper.includes('URL') || upper.includes('ENDPOINT')) {
    if (upper.includes('DATABASE') || upper.includes('DB')) return 'postgresql://user:password@localhost:5432/dbname';
    if (upper.includes('REDIS')) return 'redis://localhost:6379';
    if (upper.includes('MONGO')) return 'mongodb://localhost:27017/dbname';
    return 'https://example.com';
  }

  // Host/port
  if (upper.includes('HOST')) return 'localhost';
  if (upper.includes('PORT')) return '3000';

  // Boolean flags
  if (upper.includes('ENABLE') || upper.includes('DEBUG') || upper.includes('VERBOSE')) return 'false';
  if (upper.includes('DISABLE')) return 'true';

  // Numeric
  if (upper.includes('TIMEOUT')) return '30000';
  if (upper.includes('MAX_') || upper.includes('LIMIT')) return '100';
  if (upper.includes('RETRY') || upper.includes('RETRIES')) return '3';

  // Email
  if (upper.includes('EMAIL') || upper.includes('MAIL_FROM')) return 'noreply@example.com';

  // Node environment
  if (upper === 'NODE_ENV') return 'development';

  // Log level
  if (upper.includes('LOG_LEVEL') || upper.includes('LOGLEVEL')) return 'info';

  // App name
  if (upper.includes('APP_NAME') || upper.includes('PROJECT_NAME')) return 'my-app';

  return 'CHANGE_ME';
}

/** Extract "Required" or "Optional" and default from a comment */
function parseTemplateComment(comment: string | null): { required: boolean; defaultValue: string | null; description: string } {
  if (!comment) return { required: false, defaultValue: null, description: '' };

  const trimmed = comment.trim();
  let required = false;
  let defaultValue: string | null = null;
  let description = trimmed;

  // Check for "Required:" prefix
  if (/^required/i.test(trimmed)) {
    required = true;
    description = trimmed.replace(/^required:?\s*/i, '');
  }

  // Check for "Optional:" prefix
  if (/^optional/i.test(trimmed)) {
    required = false;
    description = trimmed.replace(/^optional:?\s*/i, '');
  }

  // Check for "Default=value" pattern
  const defaultMatch = trimmed.match(/default\s*[=:]\s*(\S+)/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1];
    description = description.replace(/default\s*[=:]\s*\S+/i, '').trim();
  }

  return { required, defaultValue, description };
}

export async function generateCommand(
  templateFile: string,
  options: GenerateOptions
): Promise<void> {
  const template = parseEnvFile(templateFile);
  const templateActive = activeEntries(template.entries);
  const outputPath = path.resolve(options.output || '.env');
  const useDefaults = options.defaults || false;
  const useRandomSecrets = options.randomSecrets || false;
  const prefix = options.prefix || null;

  // Filter by prefix if specified
  const filteredEntries = prefix
    ? templateActive.filter((e) => e.key.startsWith(prefix))
    : templateActive;

  // Generate the new env entries
  const generated: EnvEntry[] = [];
  const secretsGenerated: string[] = [];
  const defaultsUsed: string[] = [];
  const placeholders: string[] = [];

  for (const entry of filteredEntries) {
    const { required, defaultValue, description } = parseTemplateComment(entry.comment);
    let value: string;

    // Priority: random secret > default from comment > template value > placeholder
    if (useRandomSecrets && isSecretKey(entry.key)) {
      // Generate appropriate secret
      if (entry.key.toUpperCase().includes('HEX') || entry.key.toUpperCase().includes('HASH')) {
        value = generateHex(64);
      } else {
        value = generateSecret(48);
      }
      secretsGenerated.push(entry.key);
    } else if (useDefaults && defaultValue) {
      value = defaultValue;
      defaultsUsed.push(entry.key);
    } else if (entry.value && entry.value.trim() !== '') {
      value = entry.value;
      if (entry.value === 'CHANGE_ME' || entry.value === '') {
        placeholders.push(entry.key);
      }
    } else {
      value = generatePlaceholder(entry.key, entry.value);
      if (value === 'CHANGE_ME') {
        placeholders.push(entry.key);
      }
    }

    generated.push({
      key: entry.key,
      value,
      comment: description || entry.comment,
      lineNumber: entry.lineNumber,
      isCommented: false,
      rawLine: `${entry.key}=${value}`,
    });
  }

  // Build output content with organized sections
  const lines: string[] = [
    `# Generated from template: ${template.path}`,
    `# Date: ${new Date().toISOString()}`,
    `# ---`,
    ``,
  ];

  // Group by prefix sections (e.g., DB_, API_, REDIS_, etc.)
  const sections = new Map<string, EnvEntry[]>();
  for (const entry of generated) {
    const parts = entry.key.split('_');
    const sectionKey = parts.length > 1 ? parts[0] : 'GENERAL';
    if (!sections.has(sectionKey)) sections.set(sectionKey, []);
    sections.get(sectionKey)!.push(entry);
  }

  for (const [section, entries] of sections) {
    if (sections.size > 1) {
      lines.push(`# --- ${section} ---`);
    }
    for (const entry of entries) {
      const commentSuffix = entry.comment ? ` # ${entry.comment}` : '';
      const needsQuotes = entry.value.includes(' ') || entry.value.includes('#');
      const formattedValue = needsQuotes ? `"${entry.value}"` : entry.value;
      lines.push(`${entry.key}=${formattedValue}${commentSuffix}`);
    }
    lines.push('');
  }

  const content = lines.join('\n');

  if (options.json) {
    console.log(JSON.stringify({
      templateFile: template.path,
      outputFile: outputPath,
      totalVariables: generated.length,
      secretsGenerated: secretsGenerated.length,
      defaultsUsed: defaultsUsed.length,
      placeholdersRemaining: placeholders.length,
      variables: generated.map((e) => ({
        key: e.key,
        hasValue: e.value !== '' && e.value !== 'CHANGE_ME',
        isSecret: isSecretKey(e.key),
        needsUpdate: placeholders.includes(e.key),
      })),
    }, null, 2));
    return;
  }

  // Banner
  console.log();
  console.log(chalk.bold.cyan('  EnvSync') + chalk.dim(' - Generate'));
  console.log(chalk.dim('  ' + '-'.repeat(40)));
  console.log();

  // Config info
  console.log(`  ${chalk.dim('Template:')}        ${chalk.white(template.path)}`);
  console.log(`  ${chalk.dim('Output:')}          ${chalk.white(outputPath)}`);
  console.log(`  ${chalk.dim('Use defaults:')}    ${useDefaults ? chalk.green('yes') : chalk.dim('no')}`);
  console.log(`  ${chalk.dim('Random secrets:')}  ${useRandomSecrets ? chalk.green('yes') : chalk.dim('no')}`);
  if (prefix) {
    console.log(`  ${chalk.dim('Prefix filter:')}  ${chalk.yellow(prefix)}`);
  }
  console.log();

  // Summary
  console.log(chalk.bold.underline('  Generation Summary'));
  console.log();
  console.log(`  ${chalk.dim('Total variables:'.padEnd(25))}${chalk.white(String(generated.length))}`);
  console.log(`  ${chalk.dim('Secrets generated:'.padEnd(25))}${secretsGenerated.length > 0 ? chalk.green(String(secretsGenerated.length)) : chalk.dim('0')}`);
  console.log(`  ${chalk.dim('Defaults applied:'.padEnd(25))}${defaultsUsed.length > 0 ? chalk.cyan(String(defaultsUsed.length)) : chalk.dim('0')}`);
  console.log(`  ${chalk.dim('Need manual update:'.padEnd(25))}${placeholders.length > 0 ? chalk.yellow(String(placeholders.length)) : chalk.green('0')}`);

  // List secrets that were generated
  if (secretsGenerated.length > 0) {
    console.log();
    console.log(chalk.bold.green('  Secrets auto-generated:'));
    for (const key of secretsGenerated) {
      console.log(`    ${chalk.green('\u2714')} ${chalk.white(key)}`);
    }
  }

  // List variables that still need manual update
  if (placeholders.length > 0) {
    console.log();
    console.log(chalk.bold.yellow('  Requires manual update:'));
    for (const key of placeholders) {
      console.log(`    ${chalk.yellow('\u26A0')} ${chalk.white(key)}`);
    }
  }

  // Write the file
  const fileExists = fs.existsSync(outputPath);
  if (fileExists) {
    console.log();
    console.log(chalk.yellow(`  Warning: ${outputPath} already exists and will be overwritten.`));
  }

  fs.writeFileSync(outputPath, content, 'utf-8');

  console.log();
  console.log(chalk.green(`  ${'\u2714'} Generated ${generated.length} variables to ${outputPath}`));

  if (placeholders.length > 0) {
    console.log(chalk.yellow(`  ${'\u26A0'} Remember to update ${placeholders.length} placeholder(s) with real values`));
  }

  console.log();
}
