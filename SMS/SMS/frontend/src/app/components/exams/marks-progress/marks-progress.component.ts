import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-marks-progress',
  templateUrl: './marks-progress.component.html',
  styleUrls: ['./marks-progress.component.css']
})
export class MarksProgressComponent implements OnInit {
  classes: any[] = [];
  progressData: any[] = [];
  loading = false;
  error = '';
  selectedExamType = 'mid_term';
  selectedTerm = '';
  selectedClassId = '';
  searchQuery = '';
  sortColumn: 'class' | 'avgProgress' | 'subjectsComplete' = 'avgProgress';
  sortDirection: 'asc' | 'desc' = 'desc';
  showIncompleteOnly = false;
  minProgress = 0;
  collapsed: { [classId: string]: boolean } = {};
  stats = {
    totalClasses: 0,
    totalSubjects: 0,
    subjectsComplete: 0,
    subjectsIncomplete: 0,
    averageProgress: 0
  };

  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadDefaults();
    this.loadClasses();
    this.fetchProgress();
  }

  loadDefaults() {
    this.settingsService.getActiveTerm().subscribe({
      next: (res: any) => {
        this.selectedTerm = res?.activeTerm || '';
      },
      error: () => {}
    });
  }

  loadClasses() {
    this.classService.getClassesPaginated(1, 200).subscribe({
      next: (res: any) => {
        this.classes = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      },
      error: (err: any) => console.error('Error loading classes:', err)
    });
  }

  fetchProgress() {
    this.loading = true;
    this.error = '';
    this.examService.getMarksProgress(this.selectedExamType, this.selectedTerm, this.selectedClassId).subscribe({
      next: (data: any) => {
        this.progressData = Array.isArray(data?.classes) ? data.classes : [];
        this.collapsed = {};
        this.progressData.forEach((c: any) => this.collapsed[c.classId] = false);
        this.computeStats();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load marks entry progress';
        this.loading = false;
      }
    });
  }

  computeStats() {
    const allSubjects = this.progressData.flatMap((c: any) => c.subjects || []);
    const complete = allSubjects.filter((s: any) => s.progressPercent >= 100).length;
    const incomplete = allSubjects.length - complete;
    const avg = allSubjects.length
      ? Math.round(allSubjects.reduce((sum, s) => sum + (s.progressPercent || 0), 0) / allSubjects.length)
      : 0;
    this.stats = {
      totalClasses: this.progressData.length,
      totalSubjects: allSubjects.length,
      subjectsComplete: complete,
      subjectsIncomplete: incomplete,
      averageProgress: avg
    };
  }

  getAverageProgressForClass(cls: any): number {
    const subs = (cls.subjects || []);
    if (!subs.length) return 0;
    const avg = subs.reduce((sum: number, s: any) => sum + (s.progressPercent || 0), 0) / subs.length;
    return Math.round(avg);
  }

  getSubjectsCompleteCount(cls: any): number {
    return (cls.subjects || []).filter((s: any) => s.progressPercent >= 100).length;
  }

  getViewData(): any[] {
    // Filter subjects by search/incomplete/minProgress
    const query = this.searchQuery.trim().toLowerCase();
    const filteredClasses = this.progressData
      .map((cls: any) => {
        let subjects = (cls.subjects || []);
        if (query) {
          subjects = subjects.filter((s: any) =>
            s.subjectName?.toLowerCase().includes(query) || cls.className?.toLowerCase().includes(query)
          );
        }
        if (this.showIncompleteOnly) {
          subjects = subjects.filter((s: any) => s.progressPercent < 100);
        }
        if (this.minProgress > 0) {
          subjects = subjects.filter((s: any) => s.progressPercent >= this.minProgress);
        }
        return {
          ...cls,
          subjects
        };
      })
      .filter((c: any) => c.subjects && c.subjects.length > 0);

    // Sort
    const sorted = filteredClasses.sort((a: any, b: any) => {
      let aKey = 0;
      let bKey = 0;
      if (this.sortColumn === 'class') {
        aKey = (a.className || '').localeCompare(b.className || '');
        bKey = 0; // not used
        return this.sortDirection === 'asc' ? aKey : -aKey;
      } else if (this.sortColumn === 'avgProgress') {
        aKey = this.getAverageProgressForClass(a);
        bKey = this.getAverageProgressForClass(b);
      } else if (this.sortColumn === 'subjectsComplete') {
        aKey = this.getSubjectsCompleteCount(a);
        bKey = this.getSubjectsCompleteCount(b);
      }
      return this.sortDirection === 'asc' ? aKey - bKey : bKey - aKey;
    });

    return sorted;
  }

  toggleCollapse(classId: string) {
    this.collapsed[classId] = !this.collapsed[classId];
  }

  expandAll() {
    Object.keys(this.collapsed).forEach(k => this.collapsed[k] = false);
  }

  collapseAll() {
    Object.keys(this.collapsed).forEach(k => this.collapsed[k] = true);
  }

  refresh() {
    this.fetchProgress();
  }

  exportToCsv() {
    const rows: string[] = [];
    rows.push(['Class', 'Subject', 'Progress (%)', 'Entered', 'Expected', 'Term', 'Exam Type'].join(','));
    this.getViewData().forEach((cls: any) => {
      (cls.subjects || []).forEach((s: any) => {
        const vals = [
          cls.className || '',
          s.subjectName || '',
          String(s.progressPercent ?? 0),
          String(s.enteredCount ?? 0),
          String(s.expectedCount ?? 0),
          String(s.term ?? ''),
          String(s.examType ?? '')
        ];
        rows.push(vals.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      });
    });
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marks-entry-progress.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getProgressColor(percent: number): string {
    if (percent >= 80) return '#2E7D32'; // green
    if (percent >= 50) return '#F9A825'; // amber
    return '#C62828'; // red
  }
}
