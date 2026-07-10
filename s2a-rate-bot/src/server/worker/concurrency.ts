export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(`Invalid worker concurrency: ${concurrency}`);
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runNext = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  };
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
}
