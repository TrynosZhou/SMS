import { Injectable } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { ExamService } from './exam.service';
import { ConnectivityService } from './connectivity.service';

export type OfflineQueueItemType = 'remarks' | 'marks';

export interface OfflineQueueItem {
  id: string;
  type: OfflineQueueItemType;
  createdAt: number;
  retries: number;
  label: string;
  payload: Record<string, unknown>;
}

const STORAGE_KEY = 'sms_offline_sync_queue';

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly queueChanged$ = new Subject<void>();
  private flushing = false;

  constructor(
    private connectivity: ConnectivityService,
    private examService: ExamService
  ) {
    this.connectivity.online$
      .pipe(filter((online) => online))
      .subscribe(() => {
        void this.flushQueue();
      });
  }

  onQueueChanged(): Observable<void> {
    return this.queueChanged$.asObservable();
  }

  getQueue(): OfflineQueueItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveQueue(items: OfflineQueueItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    this.queueChanged$.next();
  }

  private makeId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  enqueueRemarks(payload: {
    studentId: string;
    classId: string;
    examType: string;
    term: string;
    classTeacherRemarks: string;
    headmasterRemarks: string;
    label: string;
  }): string {
    const id = this.makeId();
    const items = this.getQueue().filter(
      (q) =>
        !(
          q.type === 'remarks' &&
          q.payload['studentId'] === payload.studentId &&
          q.payload['classId'] === payload.classId &&
          q.payload['examType'] === payload.examType &&
          q.payload['term'] === payload.term
        )
    );
    items.push({
      id,
      type: 'remarks',
      createdAt: Date.now(),
      retries: 0,
      label: payload.label,
      payload: { ...payload }
    });
    this.saveQueue(items);
    return id;
  }

  enqueueMarks(payload: {
    examId: string;
    marksData: unknown[];
    studentIds: string[];
    label: string;
  }): string {
    const id = this.makeId();
    const items = this.getQueue();
    items.push({
      id,
      type: 'marks',
      createdAt: Date.now(),
      retries: 0,
      label: payload.label,
      payload: { ...payload }
    });
    this.saveQueue(items);
    return id;
  }

  removeItem(id: string): void {
    this.saveQueue(this.getQueue().filter((q) => q.id !== id));
  }

  hasPendingRemarks(studentId: string, classId: string, examType: string, term: string): boolean {
    return this.getQueue().some(
      (q) =>
        q.type === 'remarks' &&
        q.payload['studentId'] === studentId &&
        q.payload['classId'] === classId &&
        q.payload['examType'] === examType &&
        q.payload['term'] === term
    );
  }

  hasPendingMarks(examId: string, studentId: string, subjectId: string): boolean {
    return this.getQueue().some((q) => {
      if (q.type !== 'marks' || q.payload['examId'] !== examId) return false;
      const data = q.payload['marksData'] as Array<{ studentId: string; subjectId: string }>;
      return data?.some((m) => m.studentId === studentId && m.subjectId === subjectId);
    });
  }

  async retryItem(id: string): Promise<boolean> {
    const item = this.getQueue().find((q) => q.id === id);
    if (!item) return false;
    if (!this.connectivity.isOnline) return false;
    return this.dispatchItem(item);
  }

  async flushQueue(): Promise<void> {
    if (this.flushing || !this.connectivity.isOnline) return;
    this.flushing = true;
    try {
      const items = [...this.getQueue()];
      for (const item of items) {
        await this.dispatchItem(item);
      }
    } finally {
      this.flushing = false;
    }
  }

  private async dispatchItem(item: OfflineQueueItem): Promise<boolean> {
    try {
      if (item.type === 'remarks') {
        const p = item.payload;
        await firstValueFrom(
          this.examService.saveReportCardRemarks(
            String(p['studentId']),
            String(p['classId']),
            String(p['examType']),
            String(p['term']),
            String(p['classTeacherRemarks'] || ''),
            String(p['headmasterRemarks'] || '')
          )
        );
      } else if (item.type === 'marks') {
        await firstValueFrom(
          this.examService.captureMarks(String(item.payload['examId']), item.payload['marksData'] as unknown[])
        );
      }
      this.removeItem(item.id);
      return true;
    } catch {
      const items = this.getQueue();
      const idx = items.findIndex((q) => q.id === item.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], retries: items[idx].retries + 1 };
        this.saveQueue(items);
      }
      return false;
    }
  }
}
