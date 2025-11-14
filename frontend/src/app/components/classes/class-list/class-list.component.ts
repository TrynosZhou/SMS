import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-class-list',
  templateUrl: './class-list.component.html',
  styleUrls: ['./class-list.component.css']
})
export class ClassListComponent implements OnInit {
  classes: any[] = [];
  loading = false;
  error = '';
  success = '';

  constructor(
    private classService: ClassService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    // Check for success message from query parameters
    this.route.queryParams.subscribe(params => {
      if (params['success']) {
        this.success = params['success'];
        // Clear the query parameter from URL
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          this.success = '';
        }, 5000);
      }
    });
    // Load classes on component initialization
    this.loadClasses();
  }

  loadClasses() {
    this.loading = true;
    this.error = '';
    // Note: success message is preserved if set from query params
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        this.classes = data || [];
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        
        // Handle different types of errors
        let errorMessage = 'Failed to load classes';
        
        if (err.status === 0 || err.status === undefined) {
          // Connection error (backend not running)
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loading = false;
        this.classes = []; // Clear classes array on error
      }
    });
  }

  editClass(id: string) {
    this.router.navigate([`/classes/${id}/edit`]);
  }

  deleteClass(id: string, className: string) {
    if (!confirm(`Are you sure you want to delete the class "${className}"? This action cannot be undone.`)) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.classService.deleteClass(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Class deleted successfully';
        this.loading = false;
        // Reload classes list
        this.loadClasses();
      },
      error: (err: any) => {
        console.error('Error deleting class:', err);
        console.error('Error status:', err.status);
        console.error('Error response:', err.error);
        
        // Handle different error response formats
        let errorMessage = 'Failed to delete class';
        
        if (err.status === 0 || err.status === undefined) {
          // Connection error (backend not running)
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.status === 400) {
          // Bad Request - usually means class has associated records
          if (err.error) {
            if (typeof err.error === 'string') {
              errorMessage = err.error;
            } else if (err.error.message) {
              errorMessage = err.error.message;
            }
            
            // Add details if available
            if (err.error.details) {
              const details = err.error.details;
              const detailParts: string[] = [];
              if (details.students > 0) detailParts.push(`${details.students} student(s)`);
              if (details.teachers > 0) detailParts.push(`${details.teachers} teacher(s)`);
              if (details.exams > 0) detailParts.push(`${details.exams} exam(s)`);
              
              if (detailParts.length > 0) {
                errorMessage = `Cannot delete class "${className}". This class has: ${detailParts.join(', ')}. Please remove or reassign these associations first.`;
              }
            }
          }
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loading = false;
      }
    });
  }
}

