export interface HybridLogicalClock {
  wallTime: number;
  counter: number;
  deviceId: string;
}

const HLC_PATTERN = /^(\d+)-(\d+)-(.+)$/;

export function parseHlc(value: string | null | undefined): HybridLogicalClock {
  if (!value) {
    return { wallTime: 0, counter: 0, deviceId: '' };
  }

  const match = HLC_PATTERN.exec(value);
  if (!match) {
    return { wallTime: 0, counter: 0, deviceId: '' };
  }

  return {
    wallTime: Number(match[1]),
    counter: Number(match[2]),
    deviceId: match[3]
  };
}

export function formatHlc(clock: HybridLogicalClock): string {
  return `${clock.wallTime}-${clock.counter}-${clock.deviceId}`;
}

export function compareHlc(left: string | null | undefined, right: string | null | undefined): number {
  const a = parseHlc(left);
  const b = parseHlc(right);

  if (a.wallTime !== b.wallTime) return a.wallTime > b.wallTime ? 1 : -1;
  if (a.counter !== b.counter) return a.counter > b.counter ? 1 : -1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId > b.deviceId ? 1 : -1;
}

export function nextHlc(previous: string | null | undefined, deviceId: string, now = Date.now()): string {
  const last = parseHlc(previous);
  const wallTime = Math.max(now, last.wallTime);
  const counter = wallTime === last.wallTime ? last.counter + 1 : 0;

  return formatHlc({ wallTime, counter, deviceId });
}
