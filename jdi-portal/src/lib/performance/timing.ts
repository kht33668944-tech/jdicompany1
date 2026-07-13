export interface TimingFields {
  route: string;
  operation: string;
  requestId: string;
}

export interface TimingEvent extends TimingFields {
  durationMs: number;
}

interface TimingOptions {
  now?: () => number;
  emit?: (event: TimingEvent) => void;
}

const SLOW_OPERATION_MS = 1_000;

function emitTiming(event: TimingEvent): void {
  console.info("[performance]", event);
}

export async function measureOperation<T>(
  fields: TimingFields,
  operation: () => Promise<T>,
  options: TimingOptions = {}
): Promise<T> {
  const now = options.now ?? Date.now;
  const startedAt = now();

  try {
    return await operation();
  } finally {
    const durationMs = now() - startedAt;
    if (durationMs >= SLOW_OPERATION_MS) {
      (options.emit ?? emitTiming)({
        route: fields.route,
        operation: fields.operation,
        durationMs,
        requestId: fields.requestId,
      });
    }
  }
}
