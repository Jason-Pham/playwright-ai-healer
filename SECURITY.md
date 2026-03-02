# Security Policy

## 🔒 Security Best Practices

This document outlines security best practices for using and contributing to the Self-Healing Playwright Agent.

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please **DO NOT** open a public issue. Instead:

1. Email the maintainers directly (check package.json for contact info)
2. Include a detailed description of the vulnerability
3. Provide steps to reproduce if possible
4. Allow time for a fix before public disclosure

We take security seriously and will respond promptly to verified reports.

## API Key Management

### ⚠️ Never Commit API Keys

- Use environment variables (`.env` files)
- Add `.env` to `.gitignore`
- Use `.env.example` for documentation only
- Rotate keys if accidentally exposed

### Best Practices

```bash
# ✅ Good - Use environment variables
AI_PROVIDER=gemini
GEMINI_API_KEY=your_secret_key_here

# ❌ Bad - Never hardcode in source
const apiKey = "sk-abc123...";
```

### Key Rotation

The framework supports multiple API keys for automatic rotation:

```typescript
// Single key — provider and model are required constructor arguments
const healer = new AutoHealer(page, process.env['GEMINI_API_KEY']!, 'gemini');

// Multiple keys for rotation (recommended for OpenAI)
const healer = new AutoHealer(
    page,
    [process.env['OPENAI_API_KEY_1']!, process.env['OPENAI_API_KEY_2']!],
    'openai',
    'gpt-4o'
);
```

## Input Validation

### Selector Validation

While the framework uses AI to find selectors, always validate inputs:

```typescript
// Validate selector format before use
function isValidSelector(selector: string): boolean {
    // Check for basic CSS selector patterns
    return /^[#.\[\]a-zA-Z0-9_-]+$/.test(selector);
}
```

### HTML Sanitization

The framework automatically sanitizes DOM content before sending to AI:

- Removes `<script>` tags
- Removes `<style>` tags
- Removes comments
- Limits content size

## Rate Limiting

### Built-in Protection

The framework includes built-in rate limit handling:

- Automatically detects 429 errors
- Skips tests instead of timing out
- Supports key rotation for resilience

### Recommended Limits

- **Development**: Use generous rate limits
- **CI/CD**: Monitor usage and implement backoff
- **Production**: Use multiple keys with rotation

## Secure Configuration

### Environment-Specific Settings

```bash
# Development (.env.dev)
HEADLESS=false
LOG_LEVEL=debug

# Production (.env.prod)
HEADLESS=true
LOG_LEVEL=warn
```

### Timeout Configuration

Set appropriate timeouts to prevent hanging:

```typescript
test: {
    timeout: 180000,  // Global test timeout (from TEST_TIMEOUT env var)
    timeouts: {
        default: 60000,
        cookie: 10000,
        click: 10000,
        fill: 10000,
        short: 5000,   // Pre-validation and initial action attempts
    }
}
```

## Dependencies

### Regular Updates

- Keep dependencies up to date
- Review security advisories
- Use `npm audit` regularly

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

### Trusted Packages

This project uses well-maintained packages:

- `@playwright/test` - Official Playwright test runner
- `openai` - Official OpenAI SDK
- `@google/generative-ai` - Official Google Gemini SDK
- `winston` - Popular logging library

## Logging Security

### Safe Logging Practices

```typescript
// ✅ Good - Log without sensitive data
logger.info('[AutoHealer] Attempting click on selector');

// ❌ Bad - Don't log API keys or tokens
logger.info(`API Key: ${apiKey}`);
```

### Log Rotation

Logs are automatically rotated:

- Max file size: 5MB
- Keep last 3 files
- Located in `logs/` directory (gitignored)

## CI/CD Security

### GitHub Actions

- Use secrets for API keys
- Enable branch protection
- Require code reviews
- Run security scans

### Environment Variables in CI

```yaml
# .github/workflows/test.yml
env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Browser Security

### Sandbox Mode

Always run tests in sandboxed environments:

```typescript
// Default - secure sandbox
const browser = await chromium.launch();

// ⚠️ Avoid - disables security features
const browser = await chromium.launch({
    args: ['--no-sandbox'], // Only in trusted environments
});
```

### Context Isolation

Use isolated browser contexts:

```typescript
// Each test gets isolated context
test('my test', async ({ page }) => {
    // page is automatically isolated
});
```

## Data Privacy

### DOM Snapshots

- DOM snapshots sent to AI are simplified
- Personal data may be included - be cautious
- Use test data, not production data
- Consider data retention policies of AI providers

### Recommendations

- Use anonymized test data
- Avoid testing with real user data
- Review AI provider privacy policies
- Implement data masking if needed

## Network Security

### HTTPS Only

- Use HTTPS for all external requests
- Verify SSL certificates
- Avoid mixed content

### Proxy Support

If using a proxy, ensure it's secure:

```typescript
// Secure proxy configuration
const browser = await chromium.launch({
    proxy: {
        server: 'https://secure-proxy.example.com',
        bypass: 'localhost,127.0.0.1',
    },
});
```

## Secure Defaults

The framework is configured with secure defaults:

- ✅ Strict TypeScript compilation
- ✅ ESLint security rules enabled
- ✅ No eval or dynamic code execution
- ✅ Input validation in critical paths
- ✅ Error messages don't leak sensitive info

## Compliance

### GDPR Considerations

- Don't send PII to AI providers without consent
- Use anonymized test data
- Review data processing agreements
- Implement data retention policies

### Testing Guidelines

- Use synthetic test data
- Avoid scraping competitor sites
- Respect robots.txt
- Follow terms of service

## Security Checklist

Before deploying:

- [ ] All API keys in environment variables
- [ ] `.env` files in `.gitignore`
- [ ] Dependencies up to date
- [ ] No secrets in source code
- [ ] Logs don't contain sensitive data
- [ ] Tests use synthetic data
- [ ] Rate limits configured
- [ ] Error handling doesn't expose internals
- [ ] Security scan passed (CodeQL)
- [ ] npm audit shows no vulnerabilities

## Updates

This security policy is reviewed regularly. Last updated: 2026-02-03

## Additional Resources

- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Playwright Security](https://playwright.dev/docs/browser-contexts)
- [OpenAI Security](https://platform.openai.com/docs/guides/safety-best-practices)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
