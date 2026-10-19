const RESULT_LINE = /^\s*(?:#{1,6}\s+)?Result\s*:\s*(.*?)\s*$/i;

export function latestResultVerdict(text) {
  if (!text) {
    return "absent";
  }

  let value = null;
  for (const line of text.split(/\r?\n/)) {
    const match = RESULT_LINE.exec(line);
    if (match) {
      value = match[1];
    }
  }

  if (value == null) {
    return "absent";
  }
  if (/\bFAIL\b/i.test(value)) {
    return "fail";
  }
  if (/^\s*PASS\b/i.test(value)) {
    return "pass";
  }
  return "absent";
}
