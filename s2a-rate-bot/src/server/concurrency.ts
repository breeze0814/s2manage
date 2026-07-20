export async function mapConcurrent<T, R>(input: Readonly<{
  items: readonly T[];
  concurrency: number;
  task: (item: T) => Promise<R>;
}>): Promise<R[]> {
  if (!Number.isInteger(input.concurrency) || input.concurrency <= 0) {
    throw new Error(`Invalid concurrency: ${input.concurrency}`);
  }
  const results = new Array<R>(input.items.length);
  let nextIndex = 0;
  const runNext = async () => {
    while (nextIndex < input.items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await input.task(input.items[index]);
    }
  };
  const workerCount = Math.min(input.concurrency, input.items.length);
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
}
