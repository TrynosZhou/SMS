import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'dashboard-theme';
  private darkModeSubject = new BehaviorSubject<boolean>(this.loadStored());

  darkMode$ = this.darkModeSubject.asObservable();

  get darkMode(): boolean {
    return this.darkModeSubject.value;
  }

  constructor() {
    this.darkModeSubject.next(this.loadStored());
  }

  private loadStored(): boolean {
    try {
      return localStorage.getItem(this.STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  }

  toggleTheme(): void {
    const next = !this.darkModeSubject.value;
    try {
      localStorage.setItem(this.STORAGE_KEY, next ? 'dark' : 'light');
    } catch {}
    this.darkModeSubject.next(next);
  }
}
