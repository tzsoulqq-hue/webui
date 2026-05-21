import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

export type EventQueryCacheTarget<TEvent> = {
  queryKey: QueryKey;
  update: (prev: unknown, event: TEvent) => unknown;
};

export type EventQueryCacheOptions<TEvent> = {
  enabled?: boolean;
  url: string;
  eventName?: string;
  targets?: EventQueryCacheTarget<TEvent>[];
  parse?: (message: MessageEvent<string>) => TEvent | null;
  onEvent?: (event: TEvent, queryClient: QueryClient) => void;
  onError?: (event: Event, queryClient: QueryClient) => void;
};

export function useEventQueryCache<TEvent>(options: EventQueryCacheOptions<TEvent>) {
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;
  const enabled = options.enabled !== false;
  const eventName = options.eventName || 'message';

  useEffect(() => {
    if (!enabled || !options.url) return;
    const source = new EventSource(options.url);
    const handler = (message: Event) => {
      const event = parseEvent(latest.current, message);
      if (event == null) return;
      for (const target of latest.current.targets || []) {
        queryClient.setQueryData(target.queryKey, (prev: unknown) => target.update(prev, event));
      }
      latest.current.onEvent?.(event, queryClient);
    };
    const errorHandler = (event: Event) => latest.current.onError?.(event, queryClient);
    source.addEventListener(eventName, handler);
    source.addEventListener('error', errorHandler);
    return () => {
      source.removeEventListener(eventName, handler);
      source.removeEventListener('error', errorHandler);
      source.close();
    };
  }, [enabled, eventName, options.url, queryClient]);
}

function parseEvent<TEvent>(options: EventQueryCacheOptions<TEvent>, message: Event) {
  const typed = message as MessageEvent<string>;
  if (options.parse) return options.parse(typed);
  try {
    return JSON.parse(typed.data) as TEvent;
  } catch {
    return null;
  }
}
