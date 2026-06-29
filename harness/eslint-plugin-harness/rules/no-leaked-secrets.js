// Rule: flag hardcoded secrets, API keys, tokens, passwords.
// Agent prompt: "Never hardcode credentials. Use environment variables or a secret manager."
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Prevent hardcoded secrets and credentials in source code.' },
    schema: [],
    messages: {
      default: [
        'SECURITY [no-leaked-secrets]: Hardcoded secret detected.',
        '',
        'Do NOT commit this value. Instead:',
        '  1. Move the secret to an environment variable (e.g., process.env.API_KEY).',
        '  2. If using a frontend framework, use a build-time env var (NEXT_PUBLIC_*, VITE_*, etc.).',
        '  3. For backend services, inject via your secret manager or .env file (added to .gitignore).',
        '',
        'If this is a test fixture, wrap it in: if (__DEV__ || process.env.NODE_ENV === "test").',
      ].join('\n'),
    },
  },

  create(context) {
    const SECRET_PATTERNS = [
      { regex: /['"`](?:sk-[a-zA-Z0-9]{20,}|pk-[a-zA-Z0-9]{20,})['"`]/, label: 'API key (sk-/pk- prefix)' },
      { regex: /ghp_[a-zA-Z0-9]{36}/, label: 'GitHub personal access token' },
      { regex: /gho_[a-zA-Z0-9]{36}/, label: 'GitHub OAuth token' },
      { regex: /AKIA[0-9A-Z]{16}/, label: 'AWS access key ID' },
      { regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/, label: 'Slack token' },
      { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i, label: 'Hardcoded password' },
      { regex: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]/i, label: 'Hardcoded API key value' },
    ];

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;

        for (const pattern of SECRET_PATTERNS) {
          if (pattern.regex.test(node.value)) {
            context.report({ node, messageId: 'default' });
            return;
          }
        }
      },
    };
  },
};
