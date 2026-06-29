// Rule: ensure fetch calls have timeouts/retries.
// Agent prompt: "All network requests must use the project's retry/timeout helper."
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Ensure all fetch calls are wrapped with timeout and retry logic.' },
    schema: [],
    messages: {
      missingTimeout: [
        'RELIABILITY [fetch-needs-timeout]: This fetch call has no timeout.',
        '',
        'Fetch calls must be wrapped in our internal retry/timeout helper.',
        "Import it from @utils/network (or your project's equivalent).",
        '',
        'Example:',
        "  import { fetchWithTimeout } from '@utils/network';",
        '  const data = await fetchWithTimeout(url, { timeoutMs: 5000, retries: 2 });',
      ].join('\n'),
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'fetch') return;

        const hasTimeoutArg = node.arguments.some((arg) => {
          if (arg.type !== 'ObjectExpression') return false;
          return arg.properties.some(
            (p) =>
              p.key &&
              (p.key.name === 'timeout' ||
                p.key.name === 'signal' ||
                p.key.name === 'abortController'),
          );
        });

        if (!hasTimeoutArg) {
          context.report({ node, messageId: 'missingTimeout' });
        }
      },
    };
  },
};
