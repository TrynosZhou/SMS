import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-mark-sheet',
  templateUrl: './mark-sheet.component.html',
  styleUrls: ['./mark-sheet.component.css']
})
export class MarkSheetComponent implements OnInit {
  classes: any[] = [];
  selectedClassId = '';
  selectedExamType = '';
  selectedTerm = '';
  
  isAdmin = false;
  loadingTerm = false;
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  markSheetData: any = null;
  filteredMarkSheet: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  // Modern features
  searchQuery = '';
  sortColumn = 'position';
  sortDirection: 'asc' | 'desc' = 'asc';
  showStatistics = true;
  
  // Statistics
  statistics: any = {
    totalStudents: 0,
    averageScore: 0,
    highestScore: 0,
    lowestScore: 0,
    passRate: 0,
    topPerformers: []
  };

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private settingsService: SettingsService,
    public authService: AuthService,
    public router: Router
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  ngOnInit() {
    this.loadClasses();
    this.loadActiveTerm();
  }


  loadClasses() {
    // For admin/superadmin - load all classes using pagination
    this.loading = true;
    this.classes = [];
    this.loadAllClasses(1, []);
  }

  loadAllClasses(page: number, accumulatedClasses: any[]) {
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
          // All classes loaded - clean IDs, remove duplicates, and filter active
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
          
          // Filter to only active classes
          this.classes = Array.from(uniqueClassesMap.values()).filter(c => c.isActive);
          this.loading = false;
          console.log(`Loaded ${this.classes.length} active classes for mark sheet`);
        }
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes';
        this.loading = false;
        // Use accumulated classes if we got some before the error
        if (accumulatedClasses.length > 0) {
          this.classes = accumulatedClasses.filter(c => c.isActive);
          console.warn(`Loaded partial class list (${this.classes.length} classes) due to error`);
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }


  loadActiveTerm() {
    this.loadingTerm = true;
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.selectedTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.selectedTerm = data.currentTerm;
        }
        this.loadingTerm = false;
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        this.loadingTerm = false;
      }
    });
  }

  onClassChange() {
    this.markSheetData = null;
    this.filteredMarkSheet = [];
  }

  generateMarkSheet() {
    if (!this.selectedClassId || !this.selectedExamType) {
      this.error = 'Please select class and exam type';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (!this.selectedTerm) {
      this.error = 'Active term not found. Please configure term in settings.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    this.markSheetData = null;

    this.examService.generateMarkSheet(
      this.selectedClassId, 
      this.selectedExamType, 
      this.selectedTerm
    ).subscribe({
      next: (data: any) => {
        this.markSheetData = data;
        this.filteredMarkSheet = [...data.markSheet];
        this.calculateStatistics();
        this.loading = false;
        this.success = 'Mark sheet generated successfully';
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error generating mark sheet:', err);
        this.error = err.error?.message || 'Failed to generate mark sheet';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  printMarkSheet() {
    window.print();
  }

  downloadPDF() {
    if (!this.selectedClassId || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Please select class and exam type, and ensure term is set';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (!this.markSheetData) {
      this.error = 'Please generate mark sheet first';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.examService.downloadMarkSheetPDF(
      this.selectedClassId, 
      this.selectedExamType, 
      this.selectedTerm
    ).subscribe({
      next: (blob: Blob) => {
        const fileURL = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = fileURL;
        const className = this.markSheetData?.class?.name || 'class';
        const examType = this.selectedExamType.replace('_', '-');
        link.download = `mark-sheet-${className}-${examType}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(fileURL);
        this.loading = false;
        this.success = 'Mark sheet PDF downloaded successfully';
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error downloading mark sheet PDF:', err);
        this.error = err.error?.message || 'Failed to download mark sheet PDF';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  exportToCSV() {
    if (!this.markSheetData) return;

    const csvRows: string[] = [];
    
    // Header row
    const headers = ['Position', 'Student Number', 'Student Name', ...this.markSheetData.subjects.map((s: any) => s.name), 'Total Score', 'Total Max Score', 'Average %'];
    csvRows.push(headers.join(','));

    // Data rows
    this.markSheetData.markSheet.forEach((row: any) => {
      const values = [
        row.position,
        row.studentNumber,
        `"${row.studentName}"`,
        ...this.markSheetData.subjects.map((subject: any) => {
          const subjectData = row.subjects[subject.id];
          return subjectData ? `${subjectData.score}/${subjectData.maxScore} (${subjectData.percentage}%)` : '0/100 (0%)';
        }),
        row.totalScore,
        row.totalMaxScore,
        row.average
      ];
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `mark-sheet-${this.markSheetData.class.name}-${this.selectedExamType}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getSubjectMark(row: any, subjectId: string) {
    const subjectData = row.subjects[subjectId];
    if (!subjectData) return { score: 0, maxScore: 100, percentage: 0 };
    return subjectData;
  }

  // Modern features
  onSearch() {
    if (!this.markSheetData) return;
    
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredMarkSheet = [...this.markSheetData.markSheet];
      return;
    }

    this.filteredMarkSheet = this.markSheetData.markSheet.filter((row: any) => {
      return row.studentName.toLowerCase().includes(query) ||
             row.studentNumber.toLowerCase().includes(query) ||
             String(row.position).includes(query);
    });
  }

  sortTable(column: string) {
    if (!this.markSheetData) return;

    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.filteredMarkSheet = [...this.filteredMarkSheet].sort((a: any, b: any) => {
      let aVal: any, bVal: any;

      switch (column) {
        case 'position':
          aVal = a.position;
          bVal = b.position;
          break;
        case 'studentName':
          aVal = a.studentName.toLowerCase();
          bVal = b.studentName.toLowerCase();
          break;
        case 'studentNumber':
          aVal = a.studentNumber;
          bVal = b.studentNumber;
          break;
        case 'average':
          aVal = a.average;
          bVal = b.average;
          break;
        case 'totalScore':
          aVal = a.totalScore;
          bVal = b.totalScore;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '⇅';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  calculateStatistics() {
    if (!this.markSheetData || !this.markSheetData.markSheet.length) return;

    const marks = this.markSheetData.markSheet;
    const averages = marks.map((m: any) => m.average);
    
    this.statistics.totalStudents = marks.length;
    this.statistics.averageScore = Math.round(
      averages.reduce((sum: number, avg: number) => sum + avg, 0) / averages.length
    );
    this.statistics.highestScore = Math.max(...averages);
    this.statistics.lowestScore = Math.min(...averages);
    this.statistics.passRate = Math.round(
      (averages.filter((avg: number) => avg >= 50).length / averages.length) * 100
    );
    this.statistics.topPerformers = marks
      .sort((a: any, b: any) => b.average - a.average)
      .slice(0, 3)
      .map((m: any) => ({ name: m.studentName, average: m.average }));
  }

  getPerformanceClass(average: number): string {
    if (average >= 80) return 'excellent';
    if (average >= 70) return 'very-good';
    if (average >= 60) return 'good';
    if (average >= 50) return 'satisfactory';
    return 'needs-improvement';
  }

  getPerformanceColor(average: number): string {
    if (average >= 80) return '#28a745';
    if (average >= 70) return '#17a2b8';
    if (average >= 60) return '#ffc107';
    if (average >= 50) return '#fd7e14';
    return '#dc3545';
  }

  getSubjectAverage(subjectId: string): number {
    if (!this.markSheetData) return 0;
    
    const subjectMarks = this.markSheetData.markSheet
      .map((row: any) => row.subjects[subjectId]?.percentage || 0)
      .filter((p: number) => p > 0);
    
    if (subjectMarks.length === 0) return 0;
    return Math.round(
      subjectMarks.reduce((sum: number, p: number) => sum + p, 0) / subjectMarks.length
    );
  }
}

