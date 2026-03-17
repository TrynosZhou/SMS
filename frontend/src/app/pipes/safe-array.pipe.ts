import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'safeArray',
  standalone: false
})
export class SafeArrayPipe implements PipeTransform {
  transform<T = any>(value: any): T[] {
    // If value is already an array, return it
    if (Array.isArray(value)) {
      return value as T[];
    }

    // If value is an object with a data property that is an array, return the data array
    if (value && typeof value === 'object') {
      const data = (value as any).data;
      if (Array.isArray(data)) {
        return data as T[];
      }
    }

    // Log warning for non-array values (except null/undefined which are expected)
    if (value !== null && value !== undefined) {
      console.warn('[SafeArrayPipe] Received non-array value:', {
        type: typeof value,
        value: value,
        isNull: value === null,
        isUndefined: value === undefined,
        hasMessage: (value as any)?.message,
        hasError: (value as any)?.error,
        stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n')
      });
    }
    
    return [];
  }
}

