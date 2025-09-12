# EnvSync

[![npm version](https://img.shields.io/npm/v/@idirdev/envsync.svg)](https://www.npmjs.com/package/@idirdev/envsync)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

A CLI tool to compare, validate, merge, and generate environment variable files. Keep your `.env` files in sync across environments with confidence.

## Features

- **Compare** -- Diff two `.env` files, see added/removed/modified variables
- **Validate** -- Check an `.env` file against a template with type checking
- **Merge** -- Merge two `.env` files with conflict resolution strategies
- **Generate** -- Create a new `.env` from a template with smart defaults and random secrets
- **Safe by Default** -- Values are masked in output to prevent accidental secret exposure

## Installation

```bash
npm install -g @idirdev/envsync
```

Or run directly with npx:

```bash
npx @idirdev/envsync compare .env .env.production
```

## Usage

```bash
# Compare two env files
envsync compare .env .env.production

# Show actual values in diff (caution!)
envsync compare .env .env.staging --values

# Validate against a template
envsync validate .env .env.template

# Strict mode: fail on extra variables
envsync validate .env .env.template --strict

# Merge with override strategy
envsync merge .env .env.local -o .env.merged

# Merge keeping base values on conflict
envsync merge .env .env.override --strategy keep

# Generate from template
envsync generate .env.template -o .env

# Generate with random secrets for KEY/SECRET/TOKEN vars
envsync generate .env.template --random-secrets

# Use default values from template comments
envsync generate .env.template --defaults
```

## Commands

### `envsync compare <file1> <file2>`

| Option | Description | Default |
|--------|-------------|---------|
| `--values` | Show actual values in diff | false |
| `--keys-only` | Only compare keys, not values | false |
| `--json` | Output as JSON | false |

### `envsync validate <envFile> <templateFile>`

| Option | Description | Default |
|--------|-------------|---------|
| `--strict` | Fail if extra variables found | false |
| `--no-empty` | Fail if any value is empty | false |
| `--json` | Output as JSON | false |

### `envsync merge <baseFile> <overrideFile>`

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | stdout |
| `--strategy <s>` | Conflict strategy: override, keep, comment | override |
| `--backup` | Backup existing output file | false |
| `--json` | Output as JSON | false |

### `envsync generate <templateFile>`

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | .env |
| `--defaults` | Use defaults from template comments | false |
| `--random-secrets` | Auto-generate secret values | false |
| `--prefix <prefix>` | Only generate vars with this prefix | -- |
| `--json` | Output as JSON | false |

## Template Format

Templates are `.env` files with optional comment annotations:

```bash
# Required: PostgreSQL connection string
DATABASE_URL=

# Optional: Default=3000
PORT=3000

# Required: Random secret for JWT signing
JWT_SECRET=

# Optional: Default=info
LOG_LEVEL=info

# Required: Redis cache URL
REDIS_URL=
```

## Development

```bash
git clone https://github.com/idirdev/envsync.git
cd envsync
npm install
npm run dev -- compare .env.example .env
```

## License

MIT
