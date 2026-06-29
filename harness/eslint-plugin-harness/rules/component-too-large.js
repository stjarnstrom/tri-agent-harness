// Rule: flag UI components that exceed a line-count threshold.
// Agent prompt: "Components must be under N lines. Extract stateless child components."
module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Warn when a component exceeds the maximum allowed line count.' },
    schema: [
      {
        type: 'object',
        properties: {
          maxLines: { type: 'integer', minimum: 50, default: 150 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLarge:
        'COMPONENT SIZE [component-too-large]: This component is {{maxLines}}+ lines.\n\n' +
        'Break this into smaller, stateless child components. Target: each file should be <= {{maxLines}} lines.\n\n' +
        'Guidelines:\n' +
        '  1. Extract reusable UI pieces (buttons, cards, forms) into their own files.\n' +
        '  2. Separate data-fetching logic from rendering — use a custom hook for state/effects.\n' +
        '  3. If the component has multiple responsibilities, split by concern (not just by length).',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const maxLines = options.maxLines ?? 150;

    return {
      Program(node) {
        if (!node.body.length) return;

        const sourceCode = context.getSourceCode();
        const text = sourceCode.getText();
        const lineCount = text.split('\n').length;
        const hasJsx = /<(?:[A-Z][a-z]+|[a-z][\w-]+)/.test(text);

        if (lineCount > maxLines && hasJsx) {
          context.report({ node, messageId: 'tooLarge', data: { maxLines } });
        }
      },
    };
  },
};
