export function safeArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === 'object' && Array.isArray((value as any).data)) {
    return (value as any).data as T[];
  }

  return [];
}

export function safeValue<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

