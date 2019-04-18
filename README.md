# envsync

> **[EN]** Sync and validate environment variables across .env files.
> **[FR]** Synchroniser et valider les variables d'environnement entre fichiers .env.

---

## Features / Fonctionnalites

**[EN]**
- Compare .env files to find missing variables
- Sync variables between .env.example and .env
- Validate required variables are set
- Detect duplicate keys
- Type validation (string, number, boolean, url, email)
- CI-friendly exit codes

**[FR]**
- Comparer les fichiers .env pour trouver les variables manquantes
- Synchroniser les variables entre .env.example et .env
- Valider que les variables requises sont definies
- Detecter les cles en double
- Validation de type (string, number, boolean, url, email)
- Codes de sortie compatibles CI

---

## Installation

```bash
npm install -g @idirdev/envsync
```

---

## CLI Usage / Utilisation CLI

```bash
# Compare .env.example with .env
envsync diff .env.example .env

# Validate .env has all required vars
envsync validate .env --required DB_HOST,DB_PORT,SECRET

# Sync missing vars from example
envsync sync .env.example .env

# Help
envsync --help
```

### Example Output / Exemple de sortie

```
$ envsync diff .env.example .env

Comparing .env.example -> .env

  Missing in .env:
    - DB_HOST (defined in .env.example)
    - REDIS_URL (defined in .env.example)

  Extra in .env:
    + DEBUG (not in .env.example)

  Summary: 2 missing, 1 extra, 8 synced
```

---

## API (Programmatic) / API (Programmation)

```js
const { parseEnv, diffEnv, validateEnv } = require('envsync');

// Parse a .env file
const vars = parseEnv('.env');
// => { DB_HOST: 'localhost', DB_PORT: '5432' }

// Diff two env files
const diff = diffEnv('.env.example', '.env');
// => { missing: ['SECRET'], extra: ['DEBUG'], common: ['DB_HOST'] }

// Validate
const result = validateEnv('.env', { required: ['DB_HOST', 'SECRET'] });
// => { valid: false, missing: ['SECRET'] }
```

---

## License

MIT - idirdev
