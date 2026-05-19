import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-assign-subject',
  templateUrl: './assign-subject.component.html',
  styleUrls: ['./assign-subject.component.css']
})
export class AssignSubjectComponent implements OnInit {
  classes: any[] = [];
  subjects: any[] = [];
  filteredSubjects: any[] = [];
  
  selectedClassId: string = '';
  selectedClass: any = null;
  selectedSubjectIds: string[] = [];
  subjectSearchQuery: string = '';
  
  loading = false;
  loadingClasses = false;
  loadingSubjects = false;
  error = '';
  success = '';
  successDetails: { class: string; count: number; subjects: string[] } | null = null;

  constructor(
    private classService: ClassService,
    private subjectService: SubjectService,
    public router: Router
  ) { }

  ngOnInit() {
    this.loadClasses();
    this.loadSubjects();
  }

  loadClasses() {
    this.loadingClasses = true;
    // Only clear error if it's related to classes loading
    if (this.error && (this.error.includes('classes') || this.error.includes('class'))) {
      this.error = '';
    }
    
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        // Handle both array and paginated response
        if (Array.isArray(data)) {
          this.classes = data;
        } else if (data && Array.isArray(data.data)) {
          this.classes = data.data;
        } else {
          this.classes = [];
        }
        
        this.loadingClasses = false;
        console.log('Classes loaded:', this.classes.length);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.classes = []; // Ensure classes is empty array on error
        // Only set error if there's no existing error or it's not a critical one
        if (!this.error || this.error.includes('classes') || this.error.includes('class')) {
          this.error = 'Failed to load classes. Please try again or create a class first.';
        }
        this.loadingClasses = false;
      }
    });
  }

  loadSubjects() {
    this.loadingSubjects = true;
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = data || [];
        this.filteredSubjects = [...this.subjects];
        this.loadingSubjects = false;
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.error = 'Failed to load subjects';
        this.loadingSubjects = false;
      }
    });
  }

  onClassChange() {
    this.error = '';
    this.success = '';
    
    if (!this.selectedClassId) {
      this.selectedClass = null;
      this.selectedSubjectIds = [];
      return;
    }

    // Find the selected class
    this.selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    
    if (this.selectedClass) {
      // Load class details with subjects
      this.loading = true;
      this.classService.getClassById(this.selectedClassId).subscribe({
        next: (data: any) => {
          this.selectedClass = data.class || data;
          // Get currently assigned subjects
          if (this.selectedClass.subjects && Array.isArray(this.selectedClass.subjects)) {
            this.selectedSubjectIds = this.selectedClass.subjects.map((s: any) => s.id);
          } else {
            this.selectedSubjectIds = [];
          }
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error loading class details:', err);
          this.error = 'Failed to load class details';
          this.loading = false;
        }
      });
    }
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = [...this.subjects];
      return;
    }

    const query = this.subjectSearchQuery.toLowerCase().trim();
    this.filteredSubjects = this.subjects.filter(subject =>
      subject.name?.toLowerCase().includes(query) ||
      subject.code?.toLowerCase().includes(query) ||
      subject.description?.toLowerCase().includes(query)
    );
  }

  toggleSubject(subjectId: string) {
    const index = this.selectedSubjectIds.indexOf(subjectId);
    if (index > -1) {
      this.selectedSubjectIds.splice(index, 1);
    } else {
      this.selectedSubjectIds.push(subjectId);
    }
  }

  isSubjectSelected(subjectId: string): boolean {
    return this.selectedSubjectIds.includes(subjectId);
  }

  selectAllSubjects() {
    this.selectedSubjectIds = this.filteredSubjects.map(s => s.id);
  }

  clearSelectedSubjects() {
    this.selectedSubjectIds = [];
  }

  onSubmit() {
    if (!this.selectedClassId) {
      this.error = 'Please select a class';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Update the class with selected subjects
    const updateData = {
      subjectIds: this.selectedSubjectIds
    };

    this.classService.updateClass(this.selectedClassId, updateData).subscribe({
      next: (data: any) => {
        this.loading = false;
        
        // Get selected subject names for the success message
        const selectedSubjectNames = this.subjects
          .filter(subject => this.selectedSubjectIds.includes(subject.id))
          .map(subject => subject.name);
        
        const subjectCount = this.selectedSubjectIds.length;
        const className = this.selectedClass?.name || 'class';
        
        // Create detailed success message
        if (subjectCount === 0) {
          this.success = `All subjects have been removed from ${className}`;
          this.successDetails = {
            class: className,
            count: 0,
            subjects: []
          };
        } else if (subjectCount === 1) {
          this.success = `Successfully assigned "${selectedSubjectNames[0]}" to ${className}`;
          this.successDetails = {
            class: className,
            count: 1,
            subjects: selectedSubjectNames
          };
        } else if (subjectCount <= 3) {
          this.success = `Successfully assigned ${subjectCount} subjects (${selectedSubjectNames.join(', ')}) to ${className}`;
          this.successDetails = {
            class: className,
            count: subjectCount,
            subjects: selectedSubjectNames
          };
        } else {
          this.success = `Successfully assigned ${subjectCount} subjects (${selectedSubjectNames.slice(0, 2).join(', ')}, and ${subjectCount - 2} more) to ${className}`;
          this.successDetails = {
            class: className,
            count: subjectCount,
            subjects: selectedSubjectNames
          };
        }
        
        // Clear any previous errors
        this.error = '';
        
        // Reload class details to show updated subjects
        this.onClassChange();
        
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Clear success message after 8 seconds (increased for better visibility)
        setTimeout(() => {
          this.success = '';
          this.successDetails = null;
        }, 8000);
      },
      error: (err: any) => {
        console.error('Error assigning subjects:', err);
        let errorMessage = 'Failed to assign subjects';
        
        if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        }
        
        this.error = errorMessage;
        this.loading = false;
        
        // Clear error message after 8 seconds
        setTimeout(() => {
          this.error = '';
        }, 8000);
      }
    });
  }

  getSelectedClassSubjects(): any[] {
    if (!this.selectedClass || !this.selectedClass.subjects) {
      return [];
    }
    return this.selectedClass.subjects;
  }
}

