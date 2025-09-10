#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { compareCommand } from './commands/compare';
import { validateCommand } from './commands/validate';
import { mergeCommand } from './commands/merge';
import { generateCommand } from './commands/generate';

const program = new Command();

program
  .name('envsync')
  .description(chalk.bold('Environment variable sync and management tool'))
  .version('1.0.0', '-v, --version', 'Display the current version');

program
  .command('compare <file1> <file2>')
  .description('Compare two .env files and show differences')
  .option('--values', 'Show values in the diff (caution: may expose secrets)')
  .option('--keys-only', 'Only compare keys, ignore values')
  .option('--json', 'Output as JSON')
  .action(async (file1, file2, options) => {
    try {
      await compareCommand(file1, file2, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('validate <envFile> <templateFile>')
  .description('Validate an .env file against a template')
  .option('--strict', 'Fail if extra variables not in the template are found')
  .option('--no-empty', 'Fail if any variable has an empty value')
  .option('--json', 'Output as JSON')
  .action(async (envFile, templateFile, options) => {
    try {
      await validateCommand(envFile, templateFile, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('merge <baseFile> <overrideFile>')
  .description('Merge two .env files with conflict handling')
  .option('-o, --output <file>', 'Output file path (default: stdout)')
  .option('--strategy <strategy>', 'Conflict strategy: override, keep, ask, comment', 'override')
  .option('--backup', 'Create a .bak backup of the output file if it exists')
  .option('--json', 'Output as JSON')
  .action(async (baseFile, overrideFile, options) => {
    try {
      await mergeCommand(baseFile, overrideFile, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('generate <templateFile>')
  .description('Generate a new .env file from a template')
  .option('-o, --output <file>', 'Output file path', '.env')
  .option('--defaults', 'Use default values from template comments')
  .option('--random-secrets', 'Generate random values for SECRET/KEY/TOKEN variables')
  .option('--prefix <prefix>', 'Only generate variables with this prefix')
  .option('--json', 'Output as JSON')
  .action(async (templateFile, options) => {
    try {
      await generateCommand(templateFile, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.addHelpText('after', `
${chalk.dim('Examples:')}
  ${chalk.cyan('$ envsync compare .env .env.production')}          Diff two env files
  ${chalk.cyan('$ envsync validate .env .env.template')}           Check against template
  ${chalk.cyan('$ envsync merge .env .env.local -o .env.merged')}  Merge with overrides
  ${chalk.cyan('$ envsync generate .env.template -o .env')}        Generate from template
  ${chalk.cyan('$ envsync generate .env.template --random-secrets')} Auto-fill secrets

${chalk.dim('Template format (.env.template):')}
  ${chalk.dim('# Required: Database connection string')}
  ${chalk.dim('DATABASE_URL=')}
  ${chalk.dim('# Optional: Default=3000')}
  ${chalk.dim('PORT=3000')}
  ${chalk.dim('# Required: Random secret key')}
  ${chalk.dim('JWT_SECRET=')}
`);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
