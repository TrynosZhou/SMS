import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';

@Component({
  standalone: false,  selector: 'app-rankings',
  templateUrl: './rankings.component.html',
  styleUrls: ['./rankings.component.css']
})
export class RankingsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  exams: any[] = [];
  classes: any[] = [];
  subjects: any[] = [];
  selectedExam = '';
  selectedClass = '';
  selectedSubject = '';
  selectedForm = '';
  selectedExamType = '';
  rankingType = 'class';
  rankings: any[] = [];
  filteredRankings: any[] = [];
  searchQuery = '';
  loading = false;
  loadingClasses = true;
  loadingSubjects = true;
  hasSearched = false;
  success = '';
  error = '';
  lastLoadedAt: Date | null = null;
  sortField: 'position' | 'name' | 'score' = 'position';
  sortDir: 'asc' | 'desc' = 'asc';
  availableGrades: string[] = [];
  private selectionDebounce: any;
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/rankings', () => {
      this.loadExams();
      this.loadClasses();
      this.loadSubjects();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.selectionDebounce) {
      clearTimeout(this.selectionDebounce);
    }
  }

  loadExams() {
    this.examService.getExams().subscribe({
      next: (data: any) => this.exams = data,
      error: (err: any) => console.error(err)
    });
  }

  loadClasses() {
    // Load all classes using pagination
    this.classes = [];
    this.loadAllClasses(1, []);
  }

  get dashboardStats() {
    const excellent = this.rankings.filter(r => this.getPerformanceLevel(r) === 'excellent').length;
    return {
      total: this.rankings.length,
      average: this.getAverageScore(),
      top: this.getTopScore(),
      passRate: this.getPassRate(),
      excellent
    };
  }

  get filterSummary(): { type: string; exam: string; extra?: string } | null {
    if (!this.hasSearched || !this.selectedExamType) return null;
    const examLabel = this.examTypes.find(e => e.value === this.selectedExamType)?.label || this.selectedExamType;
    if (this.rankingType === 'class') {
      return { type: 'Class position', exam: examLabel, extra: this.getSelectedClassName() };
    }
    if (this.rankingType === 'subject') {
      return {
        type: 'Subject position',
        exam: examLabel,
        extra: `${this.getSelectedSubjectName()} · ${this.getSelectedClassName()}`
      };
    }
    return { type: 'Grade position', exam: examLabel, extra: this.selectedForm };
  }

  clearAlert(type: 'success' | 'error'): void {
    if (type === 'success') this.success = '';
    else this.error = '';
    this.cdr.markForCheck();
  }

  canLoadRankings(): boolean {
    if (!this.selectedExamType?.trim()) return false;
    if (this.rankingType === 'class' || this.rankingType === 'subject') {
      return !!this.selectedClass?.trim() && (this.rankingType !== 'subject' || !!this.selectedSubject?.trim());
    }
    return !!this.selectedForm?.trim();
  }

  refreshRankings(): void {
    if (this.canLoadRankings() && this.hasSearched) {
      this.loadRankings();
    }
  }

  getSelectedClassName(): string {
    const cls = this.classes.find(c => c.id === this.selectedClass);
    return cls?.name || '—';
  }

  getSelectedSubjectName(): string {
    const sub = this.subjects.find(s => s.id === this.selectedSubject);
    return sub?.name || '—';
  }

  setSort(field: 'position' | 'name' | 'score'): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = field === 'name' ? 'asc' : 'desc';
    }
    this.applySort();
  }

  applySort(): void {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    this.filteredRankings = [...this.filteredRankings].sort((a, b) => {
      if (this.sortField === 'position') {
        return (this.getPosition(a) - this.getPosition(b)) * dir;
      }
      if (this.sortField === 'name') {
        return (a.studentName || '').localeCompare(b.studentName || '') * dir;
      }
      const scoreA = this.rankingType === 'subject' ? (a.percentage || 0) : (a.average || 0);
      const scoreB = this.rankingType === 'subject' ? (b.percentage || 0) : (b.average || 0);
      return (scoreA - scoreB) * dir;
    });
  }

  loadAllClasses(page: number, accumulatedClasses: any[]) {
    this.loadingClasses = page === 1 && accumulatedClasses.length === 0;
    this.classService.getClassesPaginated(page, 100).subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        const allClasses = [...accumulatedClasses, ...data];
        
        // Check if there are more pages to fetch
        const totalPages = response?.totalPages || 1;
        const currentPage = response?.page || page;
        
        if (currentPage < totalPages) {
          // Fetch next page
          this.loadAllClasses(currentPage + 1, allClasses);
        } else {
          // All classes loaded - clean IDs and remove duplicates
          const cleanedClasses = allClasses.map((classItem: any) => {
            if (classItem.id) {
              let cleanId = String(classItem.id).trim();
              if (cleanId.includes(':')) {
                cleanId = cleanId.split(':')[0].trim();
              }
              classItem.id = cleanId;
            }
            return classItem;
          });
          
          // Remove duplicates by ID
          const uniqueClassesMap = new Map<string, any>();
          cleanedClasses.forEach((classItem: any) => {
            const id = classItem.id || '';
            if (id && !uniqueClassesMap.has(id)) {
              uniqueClassesMap.set(id, classItem);
            }
          });
          
          this.classes = Array.from(uniqueClassesMap.values());
          
          // Extract unique grades/forms from classes
          const gradesSet = new Set<string>();
          this.classes.forEach((cls: any) => {
            if (cls.form) {
              gradesSet.add(cls.form);
            }
          });
          this.availableGrades = Array.from(gradesSet).sort();
          this.loadingClasses = false;
          this.cdr.markForCheck();
        }
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.loadingClasses = false;
        // Use accumulated classes if we got some before the error
        if (accumulatedClasses.length > 0) {
          this.classes = accumulatedClasses;
          // Extract grades from partial list
          const gradesSet = new Set<string>();
          this.classes.forEach((cls: any) => {
            if (cls.form) {
              gradesSet.add(cls.form);
            }
          });
          this.availableGrades = Array.from(gradesSet).sort();
          console.warn(`Loaded partial class list (${accumulatedClasses.length} classes) due to error`);
        } else {
          this.classes = [];
          this.availableGrades = [];
        }
      }
    });
  }

  loadSubjects() {
    this.loadingSubjects = true;
    this.subjectService
      .getSubjects()
      .pipe(
        finalize(() => {
          this.loadingSubjects = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          const arr = Array.isArray(data) ? data : [];
          this.subjects = this.sortSubjects(
            arr.map((s: any) => {
              const item = { ...s };
              if (item.id) {
                let cleanId = String(item.id).trim();
                if (cleanId.includes(':')) {
                  cleanId = cleanId.split(':')[0].trim();
                }
                item.id = cleanId;
              }
              return item;
            })
          );
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading subjects:', err);
          this.subjects = [];
          this.error = err.error?.message || 'Failed to load subjects from database.';
          this.cdr.markForCheck();
          setTimeout(() => {
            this.error = '';
            this.cdr.markForCheck();
          }, 7000);
        }
      });
  }

  private sortSubjects(list: any[]): any[] {
    return [...list].sort((a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    );
  }

  onRankingTypeChange() {
    this.rankings = [];
    this.hasSearched = false;
    // Preserve exam type; clear only fields not relevant to selected ranking type
    const rt = this.rankingType;
    if (rt === 'class') {
      this.selectedSubject = '';
      this.selectedForm = '';
    } else if (rt === 'subject') {
      this.selectedForm = '';
    } else if (rt === 'overall-performance') {
      this.selectedClass = '';
      this.selectedSubject = '';
    }
    // Attempt auto-load if requirements are already satisfied
    this.onSelectionChange();
  }

  onClassFilterChange(): void {
    if (this.rankingType === 'class') {
      this.onSelectionChange();
    }
  }

  onSelectionChange() {
    if (this.selectionDebounce) {
      clearTimeout(this.selectionDebounce);
    }
    this.selectionDebounce = setTimeout(() => {
      const rt = this.rankingType;
      const hasExamType = !!(this.selectedExamType && String(this.selectedExamType).trim());
      if (rt === 'class') {
        if (hasExamType && this.selectedClass && String(this.selectedClass).trim()) {
          this.loadRankings();
        }
      } else if (rt === 'subject') {
        // Subject rankings load only when user clicks "Load Rankings"
      } else if (rt === 'overall-performance') {
        if (hasExamType && this.selectedForm && String(this.selectedForm).trim()) {
          this.loadRankings();
        }
      }
    }, 300);
  }

  clearFilters() {
    this.rankings = [];
    this.filteredRankings = [];
    this.searchQuery = '';
    this.hasSearched = false;
    this.success = '';
    this.error = '';
    this.lastLoadedAt = null;
    this.selectedExam = '';
    this.selectedClass = '';
    this.selectedSubject = '';
    this.selectedForm = '';
    this.selectedExamType = '';
    this.sortField = 'position';
    this.sortDir = 'asc';
  }

  loadRankings() {
    this.error = '';
    this.success = '';
    if (!this.canLoadRankings()) {
      this.error = 'Please complete all required filters before loading rankings.';
      setTimeout(() => { this.error = ''; this.cdr.markForCheck(); }, 5000);
      return;
    }

    this.loading = true;
    this.hasSearched = true;
    let request;

    if (this.rankingType === 'class') {
      if (!this.selectedExamType || !this.selectedClass) {
        this.loading = false;
        return;
      }
      // For class rankings, we need to get exams by type and class, then aggregate
      request = this.examService.getClassRankingsByType(this.selectedExamType, this.selectedClass);
    } else if (this.rankingType === 'subject') {
      if (!this.selectedExamType || !this.selectedSubject || !this.selectedClass) {
        this.loading = false;
        return;
      }
      request = this.examService.getSubjectRankingsByType(
        this.selectedExamType,
        this.selectedSubject,
        this.selectedClass
      );
    } else if (this.rankingType === 'overall-performance') {
      if (!this.selectedForm || !this.selectedExamType) {
        this.loading = false;
        return;
      }
      request = this.examService.getOverallPerformanceRankings(this.selectedForm, this.selectedExamType);
    } else {
      this.loading = false;
      return;
    }

    request.subscribe({
      next: (data: any) => {
        this.rankings = data || [];
        this.filteredRankings = [...this.rankings];
        this.sortField = 'position';
        this.sortDir = 'asc';
        this.applySort();
        this.lastLoadedAt = new Date();
        this.loading = false;
        if (this.rankings.length === 0) {
          this.error = 'No ranking data found for the selected criteria.';
        } else {
          this.success = `Loaded ${this.rankings.length} student ranking${this.rankings.length === 1 ? '' : 's'}.`;
        }
        this.cdr.markForCheck();
        setTimeout(() => { this.success = ''; this.cdr.markForCheck(); }, 5000);
      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;
        this.rankings = [];
        this.filteredRankings = [];
        this.error = err.error?.message || 'Failed to load rankings. Check filters and try again.';
        this.cdr.markForCheck();
        setTimeout(() => { this.error = ''; this.cdr.markForCheck(); }, 7000);
      }
    });
  }

  filterRankings() {
    if (!this.searchQuery.trim()) {
      this.filteredRankings = [...this.rankings];
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      this.filteredRankings = this.rankings.filter(r =>
        r.studentName?.toLowerCase().includes(query) ||
        r.class?.toLowerCase().includes(query)
      );
    }
    this.applySort();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  getScore(ranking: any): number {
    return this.rankingType === 'subject' 
      ? Math.round(ranking.percentage || 0) 
      : Math.round(ranking.average || 0);
  }

  getPosition(ranking: any): number {
    return ranking.classPosition || ranking.subjectPosition || ranking.overallPosition || 0;
  }

  trackByStudent(index: number, ranking: any): string {
    return ranking.studentId || ranking.studentName || index.toString();
  }

  getAverageScore(): number {
    if (this.rankings.length === 0) return 0;
    const scores = this.rankings.map(r => 
      this.rankingType === 'subject' ? r.percentage : r.average
    );
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round((sum / scores.length) * 100) / 100;
  }

  getTopScore(): number {
    if (this.rankings.length === 0) return 0;
    const scores = this.rankings.map(r => 
      this.rankingType === 'subject' ? r.percentage : r.average
    );
    return Math.max(...scores);
  }

  getPassRate(): number {
    if (this.rankings.length === 0) return 0;
    const passingCount = this.rankings.filter(r => {
      const score = this.rankingType === 'subject' ? r.percentage : r.average;
      return score >= 50;
    }).length;
    return Math.round((passingCount / this.rankings.length) * 100);
  }

  getPerformanceLevel(ranking: any): string {
    const score = this.rankingType === 'subject' ? ranking.percentage : ranking.average;
    if (score >= 80) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
  }

  getPerformanceLabel(ranking: any): string {
    const score = this.rankingType === 'subject' ? ranking.percentage : ranking.average;
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Average';
    return 'Needs Improvement';
  }

  exportToCSV() {
    if (this.rankings.length === 0) return;

    const headers = ['Position', 'Student Name'];
    if (this.rankingType === 'overall-performance') headers.push('Class');
    if (this.rankingType === 'class' || this.rankingType === 'overall-performance') {
      headers.push('Average (%)');
    }
    if (this.rankingType === 'subject') {
      headers.push('Score', 'Percentage (%)');
    }
    headers.push('Performance');

    const rows = this.rankings.map(r => {
      const row = [
        r.classPosition || r.subjectPosition || r.overallPosition,
        r.studentName
      ];
      if (this.rankingType === 'overall-performance') row.push(r.class || 'N/A');
      if (this.rankingType === 'class' || this.rankingType === 'overall-performance') {
        row.push(r.average.toFixed(2));
      }
      if (this.rankingType === 'subject') {
        row.push(`${r.score} / ${r.maxScore}`, r.percentage.toFixed(2));
      }
      row.push(this.getPerformanceLabel(r));
      return row;
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rankings_${this.rankingType}_${new Date().getTime()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  printRankings() {
    window.print();
  }
}
