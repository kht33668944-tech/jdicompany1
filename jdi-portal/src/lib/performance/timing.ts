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

// 요청 처리 "단계"별 병목 추적용. 느린 요청(3초+)의 시간이 어느 단계에서
// 소비되는지 로그로 남긴다. 정상 응답은 수십 ms 수준이므로 300ms 이상만 기록.
const SLOW_STAGE_MS = 300;

/** 프로미스 하나의 소요 시간을 재고, 느리면 `[stage]` 로그를 남긴다. */
export async function timeStage<T>(
  route: string,
  stage: string,
  promise: Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await promise;
  } finally {
    const ms = Date.now() - startedAt;
    if (ms >= SLOW_STAGE_MS) {
      console.info("[stage]", { route, stage, ms });
    }
  }
}

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
