import chalk from 'chalk';
import { parseEnvFile, activeEntries, entriesToMap } from '../utils/parser';

interface ValidateOptions {
  strict?: boolean;
  empty?: boolean; // --no-empty sets this to false
  json?: boolean;
}

interface ValidationIssue {
  key: string;
  type: 'missing' | 'empty' | 'extra' | 'type_mismatch';
  message: string;
  severity: 'error' | 'warning';
}

/** Detect the expected type of a value from its template default or key name */
function detectExpectedType(key: string, templateValue: string): string {
  // Check the template value for hints
  if (templateValue === 'true' || templateValue === 'false') return 'boolean';
  if (/^\d+$/.test(templateValue)) return 'integer';
  if (/^\d+\.\d+$/.test(templateValue)) return 'float';
  if (/^https?:\/\//.test(templateValue)) return 'url';

  // Detect from key name patterns
  const keyUpper = key.toUpperCase();
  if (keyUpper.includes('PORT') || keyUpper.includes('TIMEOUT') || keyUpper.includes('MAX_') || keyUpper.includes('LIMIT')) return 'integer';
  if (keyUpper.includes('URL') || keyUpper.includes('ENDPOINT') || keyUpper.includes('HOST')) return 'url_or_string';
  if (keyUpper.includes('ENABLE') || keyUpper.includes('DISABLE') || keyUpper.includes('DEBUG') || keyUpper.includes('VERBOSE')) return 'boolean';

  return 'string';
}

/** Simple type validation */
function validateType(value: string, expectedType: string): boolean {
  switch (expectedType) {
    case 'boolean':
      return ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase());
    case 'integer':
      return /^\d+$/.test(value);
    case 'float':
      return /^\d+(\.\d+)?$/.test(value);
    case 'url':
      return /^https?:\/\/.+/.test(value);
    case 'url_or_string':
      return value.length > 0;
    default:
      return true;
  }
}

export async function validateCommand(
  envFile: string,
  templateFile: string,
  options: ValidateOptions
): Promise<void> {
  const env = parseEnvFile(envFile);
  const template = parseEnvFile(templateFile);
  const checkEmpty = options.empty !== false; // default true unless --no-empty

  const envActive = activeEntries(env.entries);
  const templateActive = activeEntries(template.entries);
  const envMap = entriesToMap(envActive);
  const templateMap = entriesToMap(templateActive);

  const issues: ValidationIssue[] = [];

  // Check for missing variables (in template but not in env)
  for (const [key, templateEntry] of templateMap) {
    const envEntry = envMap.get(key);

    if (!envEntry) {
      issues.push({
        key,
        type: 'missing',
        message: `Variable "${key}" is defined in template but missing from env file`,
        severity: 'error',
      });
      continue;
    }

    // Check for empty values
    if (checkEmpty && envEntry.value === '' && templateEntry.value !== '') {
      issues.push({
        key,
        type: 'empty',
        message: `Variable "${key}" has an empty value (template default: "${templateEntry.value}")`,
        severity: 'warning',
      });
    }

    // Type validation
    if (envEntry.value !== '' && templateEntry.value !== '') {
      const expectedType = detectExpectedType(key, templateEntry.value);
      if (expectedType !== 'string' && !validateType(envEntry.value, expectedType)) {
        issues.push({
          key,
          type: 'type_mismatch',
          message: `Variable "${key}" expected ${expectedType} but got "${envEntry.value}"`,
          severity: 'warning',
        });
      }
    }
  }

  // Check for extra variables (in env but not in template)
  if (options.strict) {
    for (const key of envMap.keys()) {
      if (!templateMap.has(key)) {
        issues.push({
          key,
          type: 'extra',
          message: `Variable "${key}" is in env file but not defined in template (strict mode)`,
          severity: 'warning',
        });
      }
    }
  }

  // Sort issues: errors first, then warnings
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const isValid = errors.length === 0;

  if (options.json) {
    console.log(JSON.stringify({
      valid: isValid,
      envFile: env.path,
      templateFile: template.path,
      envVariables: envActive.length,
      templateVariables: templateActive.length,
      errors: errors.length,
      warnings: warnings.length,
      issues: issues.map((i) => ({
        key: i.key,
        type: i.type,
        severity: i.severity,
        message: i.message,
      })),
    }, null, 2));
    return;
  }

  // Banner
  console.log();
  console.log(chalk.bold.cyan('  EnvSync') + chalk.dim(' - Validate'));
  console.log(chalk.dim('  ' + '-'.repeat(40)));
  console.log();

  // File info
  console.log(`  ${chalk.dim('Env file:')}     ${chalk.white(env.path)} ${chalk.dim(`(${envActive.length} variables)`)}`);
  console.log(`  ${chalk.dim('Template:')}     ${chalk.white(template.path)} ${chalk.dim(`(${templateActive.length} variables)`)}`);
  console.log(`  ${chalk.dim('Strict mode:')}  ${options.strict ? chalk.yellow('enabled') : chalk.dim('disabled')}`);
  console.log(`  ${chalk.dim('Check empty:')}  ${checkEmpty ? chalk.yellow('enabled') : chalk.dim('disabled')}`);
  console.log();

  // Results
  if (isValid && warnings.length === 0) {
    console.log(chalk.green('  ' + '\u2714' + ' Validation passed! All template variables are present and valid.'));
    console.log();
    return;
  }

  // Show errors
  if (errors.length > 0) {
    console.log(chalk.bold.red(`  Errors (${errors.length}):`));
    console.log();
    for (const issue of errors) {
      const icon = chalk.red('\u2718');
      console.log(`  ${icon} ${chalk.red(issue.key)}`);
      console.log(`    ${chalk.dim(issue.message)}`);
    }
    console.log();
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log(chalk.bold.yellow(`  Warnings (${warnings.length}):`));
    console.log();
    for (const issue of warnings) {
      const icon = chalk.yellow('\u26A0');
      console.log(`  ${icon} ${chalk.yellow(issue.key)}`);
      console.log(`    ${chalk.dim(issue.message)}`);
    }
    console.log();
  }

  // Summary
  const statusIcon = isValid ? chalk.green('\u2714') : chalk.red('\u2718');
  const statusText = isValid
    ? chalk.green('Validation passed (with warnings)')
    : chalk.red('Validation failed');
  console.log(`  ${statusIcon} ${statusText}`);
  console.log(chalk.dim(`    ${errors.length} error(s), ${warnings.length} warning(s)`));
  console.log();

  if (!isValid) {
    process.exit(1);
  }
}
