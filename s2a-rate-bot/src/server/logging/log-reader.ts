export function parseJsonLogTail(
  content: Buffer,
  options: Readonly<{ truncatedAtStart: boolean }>,
) {
  const text = content.toString("utf8");
  const firstLineEnd = options.truncatedAtStart ? text.indexOf("\n") : -1;
  const start = options.truncatedAtStart ? firstLineEnd + 1 : 0;
  if (options.truncatedAtStart && firstLineEnd < 0) return [];

  const lastLineEnd = text.lastIndexOf("\n");
  if (lastLineEnd < start) return [];
  const lines = text.slice(start, lastLineEnd).split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`日志第 ${index + 1} 行不是有效 JSON`, { cause: error });
    }
  });
}
