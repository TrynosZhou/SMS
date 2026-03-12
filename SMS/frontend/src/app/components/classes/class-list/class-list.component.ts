import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-class-list',
  templateUrl: './class-list.component.html',
  styleUrls: ['./class-list.component.css']
})
export class ClassListComponent implements OnInit {
  classes: any[] = [];
  filteredClasses: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  // Search and filter properties
  searchTerm: string = '';
  statusFilter: string = 'all';
  sortBy: string = 'name';
  sortColumn: string = 'name';
  sortDirection: 'asc' | 'desc' = 'asc';
  pagination = {
    page: 1,
    limit: 1000, // Set high limit to show all classes by default
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50, 100, 500, 1000];

  constructor(
    private classService: ClassService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
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

  loadClasses(page = this.pagination.page) {
    this.loading = true;
    this.error = '';
    // Note: success message is preserved if set from query params
    this.classService.getClassesPaginated(page, this.pagination.limit).subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        // Clean IDs in case they have any trailing characters
        let cleanedData = data.map((classItem: any) => {
          if (classItem.id) {
            let cleanId = String(classItem.id).trim();
            // Remove any trailing :number or :text patterns
            if (cleanId.includes(':')) {
              cleanId = cleanId.split(':')[0].trim();
            }
            classItem.id = cleanId;
          }
          return classItem;
        });
        
        // Remove duplicates based on ID (after cleaning)
        // Use a Map to track unique classes by ID
        const uniqueClassesMap = new Map<string, any>();
        let duplicatesCount = 0;
        
        cleanedData.forEach((classItem: any) => {
          const id = classItem.id || '';
          
          // If class has an ID, use it as the key
          if (id) {
            // Check if we already have this class by ID
            if (uniqueClassesMap.has(id)) {
              duplicatesCount++;
              // Keep the first occurrence (or you could keep the one with more data)
              return; // Skip duplicate
            }
            // Add to map
            uniqueClassesMap.set(id, classItem);
          } else {
            // If no ID, check by name as fallback
            const name = classItem.name || '';
            if (name) {
              const existingByName = Array.from(uniqueClassesMap.values()).find(
                (c: any) => !c.id && c.name === name
              );
              if (existingByName) {
                duplicatesCount++;
                return; // Skip duplicate
              }
            }
            // Add with a generated key
            uniqueClassesMap.set(`no-id-${uniqueClassesMap.size}`, classItem);
          }
        });
        
        // Convert map back to array
        this.classes = Array.from(uniqueClassesMap.values());
        
        // Log if duplicates were removed (only in development)
        if (duplicatesCount > 0) {
          console.log(`Removed ${duplicatesCount} duplicate class(es) from display`);
        }
        
        if (response?.page !== undefined) {
          this.pagination = {
            page: response.page,
            limit: response.limit,
            total: this.classes.length, // Use deduplicated count
            totalPages: response.totalPages
          };
        } else {
          this.pagination.total = this.classes.length; // Use deduplicated count
          this.pagination.totalPages = Math.max(1, Math.ceil(this.pagination.total / this.pagination.limit));
          this.pagination.page = page;
        }
        const classesArray = Array.isArray(this.classes) ? this.classes : [];
        this.filteredClasses = [...classesArray];
        this.loading = false;
        // Use setTimeout to avoid NG0900 error - filter after change detection completes
        setTimeout(() => {
          this.filterClasses();
          this.cdr.detectChanges();
        }, 0);
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
        this.filteredClasses = [];
      }
    });
  }

  filterClasses() {
    this.filteredClasses = this.classes.filter(classItem => {
      // Search filter
      const matchesSearch = !this.searchTerm || 
        classItem.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        classItem.form?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        classItem.description?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      // Status filter
      const matchesStatus = this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && classItem.isActive) ||
        (this.statusFilter === 'inactive' && !classItem.isActive);
      
      return matchesSearch && matchesStatus;
    });
    
    this.sortClasses();
  }

  sortClasses() {
    if (!this.sortBy) return;
    
    this.sortColumn = this.sortBy;
    this.filteredClasses.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (this.sortBy) {
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'form':
          aValue = a.form?.toLowerCase() || '';
          bValue = b.form?.toLowerCase() || '';
          break;
        case 'students':
          aValue = a.students?.length || 0;
          bValue = b.students?.length || 0;
          break;
        case 'teachers':
          aValue = a.teachers?.length || 0;
          bValue = b.teachers?.length || 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return this.sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  sortByColumn(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.sortBy = column;
    this.sortClasses();
  }

  clearSearch() {
    this.searchTerm = '';
    this.filterClasses();
  }

  clearFilters() {
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.filterClasses();
  }

  truncate(text: string, length: number): string {
    if (!text) return 'N/A';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  getCleanId(id: any): string {
    if (!id) {
      console.warn('getCleanId: No ID provided');
      return '';
    }
    let cleanId = String(id).trim();
    console.log('getCleanId - Original:', id, 'Type:', typeof id);
    
    // Remove any trailing :number or :text patterns (e.g., :1, :abc)
    if (cleanId.includes(':')) {
      const parts = cleanId.split(':');
      cleanId = parts[0].trim();
      console.log('getCleanId - Had colon, cleaned to:', cleanId, 'Removed:', parts.slice(1).join(':'));
    }
    
    // Final validation - ensure it's a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
      console.error('getCleanId - Invalid UUID after cleaning:', cleanId);
    }
    
    return cleanId;
  }

  editClass(id: string) {
    const cleanId = this.getCleanId(id);
    this.router.navigate([`/classes/${cleanId}/edit`]);
  }

  deleteClass(id: string, className: string) {
    if (!confirm(`Are you sure you want to delete the class "${className}"? This action cannot be undone.`)) {
      return;
    }

    // Validate ID
    if (!id) {
      this.error = 'Invalid class ID. Cannot delete class.';
      console.error('Invalid class ID:', id);
      return;
    }

    // Log original ID for debugging
    console.log('Original ID received:', id, 'Type:', typeof id);

    // Clean and trim the ID - remove any trailing characters after colon
    let cleanId = String(id).trim();
    
    // Remove any trailing :number or :text patterns (e.g., :1, :abc)
    if (cleanId.includes(':')) {
      cleanId = cleanId.split(':')[0].trim();
    }
    
    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
      this.error = 'Invalid class ID format. Cannot delete class.';
      console.error('Invalid class ID format. Original:', id, 'Cleaned:', cleanId);
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    console.log('Deleting class with cleaned ID:', cleanId);

    this.classService.deleteClass(cleanId).subscribe({
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
        
        // Clear error message after 8 seconds
        setTimeout(() => {
          this.error = '';
        }, 8000);
      }
    });
  }

  onPageChange(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.loadClasses(page);
  }

  onPageSizeChange(limit: number | string) {
    const parsedLimit = Number(limit);
    this.pagination.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : this.pagination.limit;
    this.pagination.page = 1;
    this.loadClasses(1);
  }
}

