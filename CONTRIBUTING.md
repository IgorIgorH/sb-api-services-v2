# Contributing to SB Agent Portal

We love your input! We want to make contributing to SB Agent Portal as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## Pull Requests

Pull requests are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker](../../issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](../../issues/new); it's that easy!

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Development Setup

### Prerequisites

- Node.js (v18 or higher)
- MongoDB
- npm or yarn

### Setup

1. Clone your fork of the repository:
```bash
git clone https://github.com/yourusername/sb-agent-portal.git
cd sb-agent-portal
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment example file and configure:
```bash
cp .env.example .env
```

4. Set up your environment variables in the `.env` file.

5. Start the development server:
```bash
npm run dev
```

### Running Tests

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

### Code Style

We use ESLint and Prettier for code formatting. Before submitting a PR:

```bash
npm run lint
npm run lint:fix
```

## Coding Standards

- Use TypeScript for all new code
- Follow functional programming patterns where possible
- Write clear, descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use async/await instead of promises where possible

## Security Best Practices

### Never Commit Credentials or Secrets

**Critical**: Never commit sensitive information to the repository:

- ❌ **Do NOT** hardcode API keys, tokens, or passwords in code
- ❌ **Do NOT** commit `.env` files
- ❌ **Do NOT** commit setup scripts with hardcoded credentials
- ❌ **Do NOT** commit OAuth tokens or refresh tokens
- ❌ **Do NOT** commit company IDs or user identifiers

**Instead**:

- ✅ **Use environment variables** for all configuration
- ✅ **Store credentials encrypted** in MongoDB using the encryption service
- ✅ **Use `.gitignore`** to exclude sensitive files
- ✅ **Review your changes** before committing to ensure no secrets are included
- ✅ **Use placeholder values** in documentation and examples

### Before Committing

Always run these checks before committing code:

```bash
# Check for potential secrets
git diff | grep -iE "(api_key|token|password|secret|client_id|client_secret)"

# Review all changed files
git status
git diff

# Ensure .gitignore is up to date
cat .gitignore
```

### Handling API Keys

All API keys and tokens must be:

1. **Stored encrypted** in the database using `encryptData()` from `encryption.service.ts`
2. **Retrieved securely** using `getDecryptedApiKey()` from `api.key.service.ts`
3. **Never logged** to console or error messages in production
4. **Scoped per company** to ensure multi-tenancy security

Example:
```typescript
// ✅ Correct: Use encryption service
import { encryptData } from './services/encryption.service';

const encrypted = encryptData(apiKey);
company.api_keys.push({
  key: 'service_api_key',
  value: encrypted.value,
  iv: encrypted.iv,
  tag: encrypted.tag
});

// ❌ Wrong: Hardcoded API key
const API_KEY = 'sk-1234567890abcdef'; // Never do this!
```

### Setup Scripts

If you need to create setup scripts for development or testing:

1. **Add them to `.gitignore`** immediately
2. **Use environment variables** for credentials
3. **Document the process** without including actual credentials
4. **Delete temporary scripts** before committing

### Reviewing Pull Requests

When reviewing PRs, check for:

- No hardcoded credentials
- Proper use of environment variables
- Updated `.gitignore` if new secret patterns are introduced
- No accidental commits of `.env` or token files

## Project Structure

```
├── src/
│   ├── actions/              # Action handlers
│   ├── integrations/         # Third-party integrations
│   ├── models/              # Database models
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── middleware/          # Express middleware
│   └── utils/               # Utility functions
├── docs/                    # Documentation
├── tests/                   # Test files
└── e2e-tests/              # End-to-end tests
```

## Adding New Integrations

When adding new third-party integrations:

1. Create a new folder in `src/integrations/`
2. Follow the existing integration patterns
3. Add proper error handling
4. Include comprehensive tests
5. Update the documentation

## Documentation

- Keep the README up to date
- Document new APIs and features
- Use clear, concise language
- Include code examples where helpful

## Questions?

Feel free to open an issue with your question or reach out to the maintainers directly.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
