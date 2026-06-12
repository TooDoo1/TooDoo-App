import { apiUrl } from '@/lib/api';

export type RealtimeOrderUpdated = {
  type: 'order.updated';
  orderId: string;
  businessId: string;
};

export type RealtimeBusinessEventUpdated = {
  type: 'business-event.updated';
  eventId: string;
  businessId: string;
};

export type RealtimeEvent = RealtimeOrderUpdated | RealtimeBusinessEventUpdated;

export function buildRealtimeStreamUrl(token: string) {
  const base = apiUrl('/realtime/stream');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}token=${encodeURIComponent(token)}`;
}

export function parseRealtimeEvent(eventName: string, data: string): RealtimeEvent | null {
  if (!data.trim()) return null;

  try {
    const payload = JSON.parse(data) as Record<string, unknown>;
    const type = String(payload.type ?? eventName);

    if (type === 'order.updated' && payload.orderId && payload.businessId) {
      return {
        type: 'order.updated',
        orderId: String(payload.orderId),
        businessId: String(payload.businessId),
      };
    }

    if (type === 'business-event.updated' && payload.eventId && payload.businessId) {
      return {
        type: 'business-event.updated',
        eventId: String(payload.eventId),
        businessId: String(payload.businessId),
      };
    }
  } catch {
    return null;
  }

  return null;
}

export type RealtimeConnection = {
  close: () => void;
};

type DisconnectHandler = () => void;

function dispatchSseFrame(
  eventName: string,
  dataLines: string[],
  onEvent: (event: RealtimeEvent) => void
) {
  if (dataLines.length === 0) return;
  const data = dataLines.join('\n');
  const parsed = parseRealtimeEvent(eventName, data);
  if (parsed) onEvent(parsed);
}

async function readSseFetch(
  url: string,
  signal: AbortSignal,
  onEvent: (event: RealtimeEvent) => void,
  onDisconnect?: DisconnectHandler
) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal,
    });

    if (!response.ok || !response.body) {
      onDisconnect?.();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    let dataLines: string[] = [];

    const flush = () => {
      dispatchSseFrame(eventName, dataLines, onEvent);
      eventName = 'message';
      dataLines = [];
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          flush();
          continue;
        }
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }

    flush();
  } catch {
    if (signal.aborted) return;
    onDisconnect?.();
    return;
  }

  if (!signal.aborted) {
    onDisconnect?.();
  }
}

export function connectRealtimeStream(
  token: string,
  onEvent: (event: RealtimeEvent) => void,
  onDisconnect?: DisconnectHandler
): RealtimeConnection {
  const url = buildRealtimeStreamUrl(token);

  if (typeof EventSource !== 'undefined') {
    const source = new EventSource(url);

    const handleNamedEvent = (name: string) => (message: MessageEvent<string>) => {
      const parsed = parseRealtimeEvent(name, message.data);
      if (parsed) onEvent(parsed);
    };

    source.addEventListener('order.updated', handleNamedEvent('order.updated'));
    source.addEventListener('business-event.updated', handleNamedEvent('business-event.updated'));
    source.onmessage = (message) => {
      const parsed = parseRealtimeEvent('message', message.data);
      if (parsed) onEvent(parsed);
    };

    return {
      close: () => {
        source.close();
      },
    };
  }

  const abort = new AbortController();
  void readSseFetch(url, abort.signal, onEvent, onDisconnect);

  return {
    close: () => {
      abort.abort();
    },
  };
}
