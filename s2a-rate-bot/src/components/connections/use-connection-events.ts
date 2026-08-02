"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, errorMessage } from "./api";
import type {
  ConnectionEvent, ConnectionEventPage, ConnectionLifecycleEvent, HealthEvent,
} from "./types";

const EVENT_PAGE_SIZE = 50;

type EventPages = Readonly<{
  healthEvents: readonly HealthEvent[];
  lifecycleEvents: readonly ConnectionLifecycleEvent[];
  healthCursor: number | null;
  lifecycleCursor: number | null;
}>;

const EMPTY_PAGES: EventPages = {
  healthEvents: [], lifecycleEvents: [], healthCursor: null, lifecycleCursor: null,
};

export function useConnectionEvents(options: Readonly<{
  open: boolean;
  connectionId?: string;
}>) {
  const [pages, setPages] = useState<EventPages>(EMPTY_PAGES);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const requestPending = useRef(false);

  useEffect(() => {
    if (!options.open) return;
    const requestGeneration = ++generation.current;
    requestPending.current = true;
    setPages(EMPTY_PAGES);
    setLoading(true);
    setError(null);
    void readEventPages(options.connectionId).then((next) => {
      if (generation.current === requestGeneration) setPages(next);
    }).catch((reason) => {
      if (generation.current === requestGeneration) setError(errorMessage(reason));
    }).finally(() => {
      if (generation.current === requestGeneration) {
        requestPending.current = false;
        setLoading(false);
      }
    });
    return () => { generation.current += 1; requestPending.current = false; };
  }, [options.connectionId, options.open, revision]);

  const events = useMemo(
    () => mergeEvents(pages.healthEvents, pages.lifecycleEvents),
    [pages.healthEvents, pages.lifecycleEvents],
  );
  const loadMore = () => appendNextPage({
    connectionId: options.connectionId, pages, generation, requestPending,
    setPages, setLoadingMore, setError,
  });
  return {
    events, loading, loadingMore, error,
    hasMore: pages.healthCursor !== null || pages.lifecycleCursor !== null,
    loadMore,
    retry: () => setRevision((current) => current + 1),
  };
}

async function appendNextPage(options: Readonly<{
  connectionId?: string;
  pages: EventPages;
  generation: React.MutableRefObject<number>;
  requestPending: React.MutableRefObject<boolean>;
  setPages: React.Dispatch<React.SetStateAction<EventPages>>;
  setLoadingMore: (value: boolean) => void;
  setError: (value: string | null) => void;
}>) {
  if (options.requestPending.current) return;
  const requestGeneration = options.generation.current;
  options.requestPending.current = true;
  options.setLoadingMore(true);
  options.setError(null);
  try {
    const next = await readEventPages(
      options.connectionId,
      { health: options.pages.healthCursor, lifecycle: options.pages.lifecycleCursor },
    );
    if (options.generation.current !== requestGeneration) return;
    options.setPages((current) => appendPages(current, next));
  } catch (reason) {
    if (options.generation.current === requestGeneration) options.setError(errorMessage(reason));
  } finally {
    if (options.generation.current === requestGeneration) {
      options.requestPending.current = false;
      options.setLoadingMore(false);
    }
  }
}

async function readEventPages(
  connectionId?: string,
  cursors?: Readonly<{ health: number | null; lifecycle: number | null }>,
): Promise<EventPages> {
  const [health, lifecycle] = await Promise.all([
    readPage<HealthEvent>("/api/connection-health/events", connectionId, cursors?.health),
    readPage<ConnectionLifecycleEvent>("/api/connections/events", connectionId, cursors?.lifecycle),
  ]);
  return {
    healthEvents: health.events,
    lifecycleEvents: lifecycle.events,
    healthCursor: health.nextCursor,
    lifecycleCursor: lifecycle.nextCursor,
  };
}

async function readPage<T>(path: string, connectionId?: string, beforeId?: number | null) {
  if (beforeId === null) return { events: [], nextCursor: null } as ConnectionEventPage<T>;
  const query = new URLSearchParams({ limit: String(EVENT_PAGE_SIZE) });
  if (connectionId) query.set("connectionId", connectionId);
  if (beforeId !== undefined) query.set("beforeId", String(beforeId));
  return apiRequest<ConnectionEventPage<T>>(`${path}?${query}`);
}

function appendPages(current: EventPages, next: EventPages): EventPages {
  return {
    healthEvents: [...current.healthEvents, ...next.healthEvents],
    lifecycleEvents: [...current.lifecycleEvents, ...next.lifecycleEvents],
    healthCursor: next.healthCursor,
    lifecycleCursor: next.lifecycleCursor,
  };
}

function mergeEvents(
  healthEvents: readonly HealthEvent[],
  lifecycleEvents: readonly ConnectionLifecycleEvent[],
) {
  const events: ConnectionEvent[] = [
    ...healthEvents.map((event) => ({ kind: "health", event }) as const),
    ...lifecycleEvents.map((event) => ({ kind: "lifecycle", event }) as const),
  ];
  return events.sort((left, right) => {
    const time = Date.parse(right.event.createdAt) - Date.parse(left.event.createdAt);
    return time || right.event.id - left.event.id;
  });
}
