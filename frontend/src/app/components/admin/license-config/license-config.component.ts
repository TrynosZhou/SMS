import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import {
  AdminFeature,
  LicenseAdminService,
  LicenseAuditEntry,
  LicenseTierView
} from '../../../services/license-admin.service';
import { LicenseService } from '../../../services/license.service';
import { AuthService } from '../../../services/auth.service';
import { activatePageLoad } from '../../../utils/route-activation';

type LicenseTab = 'overview' | 'features' | 'matrix' | 'audit';

@Component({
  standalone: false,
  selector: 'app-license-config',
  templateUrl: './license-config.component.html',
  styleUrls: ['./license-config.component.css']
})
export class LicenseConfigComponent implements OnInit, OnDestroy {
  features: AdminFeature[] = [];
  tiers: LicenseTierView[] = [];
  auditEntries: LicenseAuditEntry[] = [];

  activeTab: LicenseTab = 'overview';
  selectedTierId = '';
  featureSearch = '';

  loading = true;
  savingFeature = false;
  savingMetaId: string | null = null;
  bulkTierAction: string | null = null;
  error = '';
  success = '';

  showCreateFeature = false;
  newFeature = { featureKey: '', displayName: '', description: '' };

  /** Immutable map so Angular detects pending-state changes */
  pendingToggles: Record<string, true> = {};

  private readonly destroy$ = new Subject<void>();
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private licenseAdmin: LicenseAdminService,
    private licenseService: LicenseService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.authService.hasRole('admin') && !this.authService.hasRole('superadmin')) {
      this.router.navigate(['/dashboard']);
      return;
    }

    activatePageLoad(this.router, this.destroy$, '/admin/license-config', () => this.loadAll());
  }

  ngOnDestroy(): void {
    if (this.successTimer) {
      clearTimeout(this.successTimer);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      features: this.licenseAdmin.listFeatures().pipe(
        catchError((err) => {
          this.error = err?.error?.message || 'Failed to load features';
          return of({ features: [] as AdminFeature[] });
        })
      ),
      tiers: this.licenseAdmin.listTiers().pipe(
        catchError((err) => {
          this.error = err?.error?.message || 'Failed to load tiers';
          return of({ tiers: [] as LicenseTierView[] });
        })
      ),
      audit: this.licenseAdmin.getAuditLog(80).pipe(catchError(() => of({ entries: [] as LicenseAuditEntry[] })))
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ features, tiers, audit }) => {
          this.features = (features.features || []).sort((a, b) =>
            a.featureKey.localeCompare(b.featureKey)
          );
          this.tiers = (tiers.tiers || []).sort((a, b) => a.tierName.localeCompare(b.tierName));
          this.auditEntries = audit.entries || [];
          if (!this.selectedTierId && this.tiers.length) {
            this.selectedTierId = this.tiers[0].id;
          }
          this.cdr.markForCheck();
        }
      });
  }

  setTab(tab: LicenseTab): void {
    this.activeTab = tab;
  }

  get activeFeatures(): AdminFeature[] {
    return this.features.filter((f) => f.isActive);
  }

  get filteredFeatures(): AdminFeature[] {
    const q = this.featureSearch.trim().toLowerCase();
    if (!q) {
      return this.features;
    }
    return this.features.filter(
      (f) =>
        f.featureKey.toLowerCase().includes(q) ||
        f.displayName.toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q)
    );
  }

  get selectedTier(): LicenseTierView | undefined {
    return this.tiers.find((t) => t.id === this.selectedTierId);
  }

  featureCountForTier(tier: LicenseTierView): number {
    return tier.features.filter((f) => f.isActive).length;
  }

  totalAssignments(): number {
    return this.tiers.reduce((sum, t) => sum + t.features.length, 0);
  }

  isFeatureOnTier(tier: LicenseTierView, featureId: string): boolean {
    return tier.features.some((f) => f.featureId === featureId);
  }

  isTogglePending(tierId: string, featureId: string): boolean {
    return !!this.pendingToggles[`${tierId}:${featureId}`];
  }

  hasPendingToggles(): boolean {
    return Object.keys(this.pendingToggles).length > 0;
  }

  private setPending(key: string, pending: boolean): void {
    if (pending) {
      this.pendingToggles = { ...this.pendingToggles, [key]: true };
    } else {
      const next = { ...this.pendingToggles };
      delete next[key];
      this.pendingToggles = next;
    }
    this.cdr.markForCheck();
  }

  private showSuccess(message: string): void {
    this.success = message;
    this.error = '';
    if (this.successTimer) {
      clearTimeout(this.successTimer);
    }
    this.successTimer = setTimeout(() => {
      this.success = '';
      this.cdr.markForCheck();
    }, 4000);
  }

  onTierFeatureToggle(tier: LicenseTierView, feature: AdminFeature, checked: boolean): void {
    const key = `${tier.id}:${feature.id}`;
    if (this.pendingToggles[key]) {
      return;
    }

    const previouslyAssigned = this.isFeatureOnTier(tier, feature.id);
    if (checked === previouslyAssigned) {
      return;
    }

    this.setPending(key, true);
    this.error = '';

    if (checked) {
      const optimistic: LicenseTierView['features'][0] = {
        assignmentId: `temp-${Date.now()}`,
        featureId: feature.id,
        featureKey: feature.featureKey,
        displayName: feature.displayName,
        description: feature.description,
        isActive: feature.isActive,
        grantedAt: new Date().toISOString()
      };
      tier.features = [...tier.features, optimistic];

      this.licenseAdmin
        .grantTierFeature(tier.id, feature.id)
        .pipe(finalize(() => this.setPending(key, false)))
        .subscribe({
          next: () => this.onToggleSuccess('Feature granted to tier'),
          error: (err) => this.onToggleError(tier, feature.id, previouslyAssigned, err)
        });
    } else {
      tier.features = tier.features.filter((f) => f.featureId !== feature.id);

      this.licenseAdmin
        .revokeTierFeature(tier.id, feature.id)
        .pipe(finalize(() => this.setPending(key, false)))
        .subscribe({
          next: () => this.onToggleSuccess('Feature revoked from tier'),
          error: (err) => this.onToggleError(tier, feature.id, previouslyAssigned, err)
        });
    }
  }

  onCheckboxClick(event: Event, tier: LicenseTierView, feature: AdminFeature): void {
    event.preventDefault();
    if (!feature.isActive || this.isTogglePending(tier.id, feature.id)) {
      return;
    }
    const next = !this.isFeatureOnTier(tier, feature.id);
    this.onTierFeatureToggle(tier, feature, next);
  }

  private onToggleSuccess(message: string): void {
    this.showSuccess(message);
    this.licenseService.refresh().subscribe({ error: () => undefined });
    this.reloadTiersAndAudit();
  }

  private onToggleError(
    tier: LicenseTierView,
    featureId: string,
    wasAssigned: boolean,
    err: any
  ): void {
    this.error = err?.error?.message || 'Failed to update tier feature';

    if (wasAssigned) {
      const feature = this.features.find((f) => f.id === featureId);
      if (feature && !tier.features.some((f) => f.featureId === featureId)) {
        tier.features = [
          ...tier.features,
          {
            assignmentId: `rollback-${Date.now()}`,
            featureId: feature.id,
            featureKey: feature.featureKey,
            displayName: feature.displayName,
            description: feature.description,
            isActive: feature.isActive
          }
        ];
      }
    } else {
      tier.features = tier.features.filter((f) => f.featureId !== featureId);
    }
    this.cdr.markForCheck();
  }

  private reloadTiersAndAudit(): void {
    this.licenseAdmin.listTiers().subscribe({
      next: (res) => {
        this.tiers = (res.tiers || []).sort((a, b) => a.tierName.localeCompare(b.tierName));
        this.cdr.markForCheck();
      }
    });
    this.licenseAdmin.getAuditLog(80).subscribe({
      next: (audit) => {
        this.auditEntries = audit.entries || [];
        this.cdr.markForCheck();
      }
    });
  }

  normalizedPreviewKey(): string {
    return this.newFeature.featureKey
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  createFeature(): void {
    if (!this.newFeature.featureKey.trim() || !this.newFeature.displayName.trim()) {
      this.error = 'Feature key and display name are required';
      return;
    }

    this.savingFeature = true;
    this.error = '';
    this.licenseAdmin
      .createFeature({
        featureKey: this.newFeature.featureKey,
        displayName: this.newFeature.displayName,
        description: this.newFeature.description || undefined
      })
      .pipe(finalize(() => (this.savingFeature = false)))
      .subscribe({
        next: (res) => {
          this.showSuccess('Feature registered');
          this.showCreateFeature = false;
          this.newFeature = { featureKey: '', displayName: '', description: '' };
          if (res.feature) {
            this.features = [...this.features, res.feature].sort((a, b) =>
              a.featureKey.localeCompare(b.featureKey)
            );
          }
          this.licenseService.refresh().subscribe({ error: () => undefined });
          this.reloadTiersAndAudit();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to create feature';
        }
      });
  }

  toggleFeatureActive(feature: AdminFeature): void {
    if (!feature.isActive) {
      return;
    }

    if (!confirm(`Deactivate "${feature.displayName}"? It will no longer be grantable.`)) {
      return;
    }

    this.licenseAdmin.deactivateFeature(feature.id).subscribe({
      next: () => {
        feature.isActive = false;
        this.showSuccess('Feature deactivated');
        this.licenseService.refresh().subscribe({ error: () => undefined });
        this.reloadTiersAndAudit();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to deactivate feature';
      }
    });
  }

  saveFeatureMeta(feature: AdminFeature): void {
    if (this.savingMetaId) {
      return;
    }

    this.savingMetaId = feature.id;
    this.error = '';
    this.licenseAdmin
      .updateFeature(feature.id, {
        displayName: feature.displayName,
        description: feature.description || ''
      })
      .pipe(
        finalize(() => {
          this.savingMetaId = null;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res) => {
          Object.assign(feature, res.feature);
          this.showSuccess('Feature details saved');
          this.licenseService.refresh().subscribe({ error: () => undefined });
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to update feature';
        }
      });
  }

  isSavingMeta(featureId: string): boolean {
    return this.savingMetaId === featureId;
  }

  assignAllActiveToTier(tier: LicenseTierView): void {
    if (this.bulkTierAction) {
      return;
    }
    const missing = this.activeFeatures.filter((f) => !this.isFeatureOnTier(tier, f.id));
    if (!missing.length) {
      this.showSuccess('All active features are already on this tier');
      return;
    }
    if (!confirm(`Grant all ${missing.length} active feature(s) to ${tier.displayName}?`)) {
      return;
    }
    this.bulkTierAction = tier.id;
    this.runBulkGrant(tier, missing, 0);
  }

  private runBulkGrant(tier: LicenseTierView, queue: AdminFeature[], index: number): void {
    if (index >= queue.length) {
      this.bulkTierAction = null;
      this.showSuccess(`Granted ${queue.length} feature(s) to ${tier.displayName}`);
      this.licenseService.refresh().subscribe({ error: () => undefined });
      this.reloadTiersAndAudit();
      this.cdr.markForCheck();
      return;
    }

    const feature = queue[index];
    this.licenseAdmin.grantTierFeature(tier.id, feature.id).subscribe({
      next: () => {
        if (!this.isFeatureOnTier(tier, feature.id)) {
          tier.features = [
            ...tier.features,
            {
              assignmentId: `bulk-${Date.now()}-${index}`,
              featureId: feature.id,
              featureKey: feature.featureKey,
              displayName: feature.displayName,
              description: feature.description,
              isActive: feature.isActive
            }
          ];
        }
        this.runBulkGrant(tier, queue, index + 1);
      },
      error: (err) => {
        this.bulkTierAction = null;
        this.error = err?.error?.message || 'Bulk grant stopped due to an error';
        this.reloadTiersAndAudit();
        this.cdr.markForCheck();
      }
    });
  }

  clearTierFeatures(tier: LicenseTierView): void {
    if (this.bulkTierAction || !tier.features.length) {
      return;
    }
    if (!confirm(`Remove all features from ${tier.displayName}? Schools on this tier will lose access immediately.`)) {
      return;
    }
    this.bulkTierAction = tier.id;
    const toRevoke = [...tier.features];
    this.runBulkRevoke(tier, toRevoke, 0);
  }

  private runBulkRevoke(
    tier: LicenseTierView,
    queue: LicenseTierView['features'],
    index: number
  ): void {
    if (index >= queue.length) {
      this.bulkTierAction = null;
      tier.features = [];
      this.showSuccess(`Cleared all features from ${tier.displayName}`);
      this.licenseService.refresh().subscribe({ error: () => undefined });
      this.reloadTiersAndAudit();
      this.cdr.markForCheck();
      return;
    }

    const item = queue[index];
    this.licenseAdmin.revokeTierFeature(tier.id, item.featureId).subscribe({
      next: () => {
        tier.features = tier.features.filter((f) => f.featureId !== item.featureId);
        this.runBulkRevoke(tier, queue, index + 1);
      },
      error: (err) => {
        this.bulkTierAction = null;
        this.error = err?.error?.message || 'Bulk revoke stopped due to an error';
        this.reloadTiersAndAudit();
        this.cdr.markForCheck();
      }
    });
  }

  copyFeatureKey(key: string): void {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(key).then(() => this.showSuccess('Feature key copied'));
    }
  }

  dismissAlerts(): void {
    this.error = '';
    this.success = '';
  }

  formatAuditAction(entry: LicenseAuditEntry): string {
    switch (entry.action) {
      case 'tier_feature_granted':
        return `Granted ${entry.featureDisplayName || entry.featureKey || 'feature'} to ${entry.tierDisplayName || entry.tierName || 'tier'}`;
      case 'tier_feature_revoked':
        return `Revoked ${entry.featureDisplayName || entry.featureKey || 'feature'} from ${entry.tierDisplayName || entry.tierName || 'tier'}`;
      case 'feature_created':
        return `Registered feature ${entry.featureDisplayName || entry.featureKey || ''}`.trim();
      case 'feature_updated':
        return `Updated feature ${entry.featureDisplayName || entry.featureKey || ''}`.trim();
      case 'feature_deactivated':
        return `Deactivated feature ${entry.featureDisplayName || entry.featureKey || ''}`.trim();
      default:
        return entry.action;
    }
  }

  tierBadgeClass(tierName: string): string {
    const n = (tierName || '').toLowerCase();
    if (n === 'gold') return 'tier-gold';
    if (n === 'bronze') return 'tier-bronze';
    if (n === 'platinum') return 'tier-platinum';
    return '';
  }

  auditActionIcon(action: string): string {
    if (action.includes('granted')) return '✓';
    if (action.includes('revoked')) return '✕';
    if (action.includes('created')) return '＋';
    if (action.includes('deactivated')) return '⊘';
    return '•';
  }
}
