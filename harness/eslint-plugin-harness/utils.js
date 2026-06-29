// Shared helpers for harness ESLint rules.

function isTestPath(filePath) {
  return (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__') ||
    filePath.includes('jest.setup') ||
    /test|spec/i.test(filePath.split('/').pop())
  );
}

function isGeneratedPath(filePath) {
  return (
    filePath.includes('__generated__') ||
    filePath.includes('__mocks__') ||
    filePath.includes('.generated.') ||
    filePath.includes('node_modules/') ||
    filePath.includes('/dist/') ||
    filePath.includes('/build/')
  );
}

function matchesGlobPattern(filePath, pattern) {
  if (!filePath || !pattern) return false;
  const regexSource = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(regexSource).test(filePath);
}

module.exports = {
  isTestPath,
  isGeneratedPath,
  matchesGlobPattern,
};
