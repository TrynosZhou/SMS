import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'safeArray',
  standalone: false
})
export class SafeArrayPipe implements PipeTransform {
  transform<T = any>(value: any): T[] {
    if (Array.isArray(value)) {
      return value as T[];
    }

    if (value && typeof value === 'object') {
      const data = (value as any).data;
      if (Array.isArray(data)) {
        return data as T[];
      }
    }

    if (value !== null && value !== undefined) {
      console.warn('safeArray pipe received a non-array value:', value);
    }
    return [];
  }
}

