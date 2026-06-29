// ESLint config for the harness — applies agent-prompt lint rules.
const plugin = require('./harness/eslint-plugin-harness');

module.exports = {
  plugins: { harness: plugin },
  rules: {
    'harness/no-leaked-secrets': 'error',
    'harness/fetch-needs-timeout': 'warn',
    'harness/component-too-large': ['warn', { maxLines: 150 }],
    'harness/file-too-large': ['warn', { maxLines: 350, excludePatterns: ['__generated__', '__mocks__'] }],
    'harness/no-console-in-prod': [
      'warn',
      {
        allowedIn: [
          '**/*.test.*',
          '**/*.spec.*',
          '**/__tests__/**',
          '**/scripts/**',
        ],
      },
    ],
    // Uncomment and configure to enforce one canonical way to do things:
    // 'harness/one-canonical-pattern': ['warn', {
    //   approvedImports: [
    //     { concept: 'fetch', allowedPaths: ['@utils/network/fetchWithTimeout'], disallowedPatterns: [] },
    //     { concept: 'log', disallowedPatterns: ['console'] },
    //   ],
    // }],
  },
};
