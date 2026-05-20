import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { LicenseService } from '../../../services/license.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-feature-gate',
  templateUrl: './feature-gate.component.html',
  styleUrls: ['./feature-gate.component.css']
})
export class FeatureGateComponent implements OnInit, OnDestroy {
  @Input() featureKey = '';
  @Input() displayName = '';

  allowed = false;
  loading = true;
  label = '';
  canManageLicense = false;

  private sub?: Subscription;

  constructor(
    public licenseService: LicenseService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.canManageLicense =
      this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
    this.syncState();

    this.sub = this.licenseService.snapshot$.subscribe(() => this.syncState());

    if (!this.licenseService.isLoaded()) {
      this.licenseService.load().subscribe(() => this.syncState());
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onUpgrade(): void {
    if (this.canManageLicense) {
      this.router.navigate(['/admin/license-config']);
      return;
    }
    alert(
      'This feature is not included in your current plan. Please contact your school administrator to upgrade.'
    );
  }

  private syncState(): void {
    this.label =
      this.displayName?.trim() ||
      this.licenseService.getFeatureDisplayName(this.featureKey);
    // Fail-open: show content while loading or if /license/me failed (no accidental lockouts).
    this.allowed = this.licenseService.hasFeature(this.featureKey);
    this.loading = false;
  }
}
