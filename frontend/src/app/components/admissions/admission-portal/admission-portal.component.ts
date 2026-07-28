import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { AdmissionApplication, AdmissionService } from '../../../services/admission.service';
import { Subject, switchMap, takeUntil, tap } from 'rxjs';
import { catchError, of } from 'rxjs';

@Component({
  standalone: false,
  selector: 'app-admission-portal',
  templateUrl: './admission-portal.component.html',
  styleUrls: ['./admission-portal.component.css'],
})
export class AdmissionPortalComponent implements OnInit, OnDestroy {
  applications: AdmissionApplication[] = [];
  loading = true;
  error = '';

  private readonly destroy$ = new Subject<void>();
  private readonly load$ = new Subject<void>();

  constructor(
    public admissionService: AdmissionService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load$
      .pipe(
        switchMap(() => {
          this.loading = true;
          this.error = '';
          this.cdr.markForCheck();
          return this.admissionService.getMyApplications().pipe(
            catchError((err) => {
              this.error = err.error?.message || 'Failed to load applications';
              return of([] as AdmissionApplication[]);
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((list) => {
        this.applications = Array.isArray(list) ? list : [];
        this.loading = false;
        this.maybeOpenFocusedApplication();
        this.cdr.markForCheck();
      });

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.load$.next();
  }

  /** After submit or sign-in, open the application status once without a second click. */
  private maybeOpenFocusedApplication(): void {
    const focusId = sessionStorage.getItem('admissionFocusApplicationId');
    if (!focusId) return;

    const hasApp = this.applications.some((a) => a.id === focusId);
    if (!hasApp) return;

    sessionStorage.removeItem('admissionFocusApplicationId');
    this.router.navigate(['/admissions/status', focusId], { replaceUrl: true });
  }

  isParent(): boolean {
    return this.authService.isParent();
  }

  isApplicant(): boolean {
    return this.authService.isApplicant();
  }

  startApplication(): void {
    this.router.navigate(['/admissions/apply']);
  }

  viewApplication(id: string): void {
    if (!id) return;
    this.router.navigate(['/admissions/status', id]);
  }

  logout(): void {
    this.authService.logout();
  }
}
