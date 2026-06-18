import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'dashboard-theme';
  private readonly darkModeSubject = new BehaviorSubject<boolean>(false);

  darkMode$ = this.darkModeSubject.asObservable();

  get darkMode(): boolean {
    return this.darkModeSubject.value;
  }

  constructor() {
    const stored = this.loadStored();
    this.darkModeSubject.next(stored);
    this.applyDocumentTheme(stored);
  }

  private loadStored(): boolean {
    try {
      return localStorage.getItem(this.STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  }

  private applyDocumentTheme(isDark: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }

  setDarkMode(isDark: boolean): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {}
    this.applyDocumentTheme(isDark);
    this.darkModeSubject.next(isDark);
  }

  toggleTheme(): void {
    this.setDarkMode(!this.darkModeSubject.value);
  }
}
