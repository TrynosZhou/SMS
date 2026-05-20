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
  tiersError = '';
  success = '';

  showCreateFeature = false;
  newFeature = { featureKey: '', displayName: '', description: '' };

  /** Immutable map so Angular detects pending-state changes */
  pendingToggles: Record<string, true> = {};

  /** Matrix checkbox state per tier (tierId -> featureIds) */
  private tierAssignmentDraft = new Map<string, Set<string>>();
  /** Last persisted state from server per tier */
  private tierAssignmentSaved = new Map<string, Set<string>>();

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
    this.tiersError = '';

    forkJoin({
      features: this.licenseAdmin.listFeatures().pipe(
        catchError((err) => {
          this.error = err?.error?.message || 'Failed to load features';
          return of({ features: [] as AdminFeature[] });
        })
      ),
      tiers: this.licenseAdmin.listTiers().pipe(
        catchError((err) => {
          this.tiersError =
            err?.error?.message ||
            'Failed to load license tiers. The tier matrix cannot be shown until tiers are available.';
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
          this.syncDraftFromTiers();
          this.cdr.markForCheck();
        }
      });
  }

  setTab(tab: LicenseTab): void {
    this.activeTab = tab;
    if (tab === 'matrix' && !this.tiers.length && !this.loading) {
      this.reloadTiersOnly();
    }
  }

  get matrixEmptyMessage(): string {
    if (this.tiersError) {
      return this.tiersError;
    }
    if (!this.tiers.length && this.features.length) {
      return (
        'License tiers (Gold, Bronze, Platinum) are not available. ' +
        'Run the license database migration on the server (npm run migrate-license), then click Refresh.'
      );
    }
    if (!this.features.length) {
      return 'Register features first, then assign them in the matrix above.';
    }
    if (this.filteredFeatures.length === 0) {
      return 'No features match your filter. Clear the search box to see the matrix.';
    }
    return 'Unable to display the tier matrix.';
  }

  private reloadTiersOnly(): void {
    this.licenseAdmin.listTiers().subscribe({
      next: (res) => {
        this.tiers = (res.tiers || []).sort((a, b) => a.tierName.localeCompare(b.tierName));
        this.tiersError = '';
        if (!this.selectedTierId && this.tiers.length) {
          this.selectedTierId = this.tiers[0].id;
        }
        this.syncDraftFromTiers();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.tiersError =
          err?.error?.message || 'Failed to load license tiers from the server.';
        this.cdr.markForCheck();
      }
    });
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
    if (tier.id === this.selectedTierId) {
      const draft = this.tierAssignmentDraft.get(tier.id);
      if (draft) {
        return draft.size;
      }
    }
    return tier.features.length;
  }

  hasUnsavedSelectedTierChanges(): boolean {
    const tierId = this.selectedTierId;
    if (!tierId) {
      return false;
    }
    const draft = this.tierAssignmentDraft.get(tierId) ?? new Set<string>();
    const saved = this.tierAssignmentSaved.get(tierId) ?? new Set<string>();
    if (draft.size !== saved.size) {
      return true;
    }
    for (const id of draft) {
      if (!saved.has(id)) {
        return true;
      }
    }
    return false;
  }

  /** Checkbox state in the matrix (selected tier uses editable draft). */
  isMatrixChecked(tier: LicenseTierView, featureId: string): boolean {
    if (tier.id === this.selectedTierId) {
      return this.tierAssignmentDraft.get(tier.id)?.has(featureId) ?? false;
    }
    return this.isFeatureOnTier(tier, featureId);
  }

  private syncDraftFromTiers(): void {
    this.tierAssignmentDraft.clear();
    this.tierAssignmentSaved.clear();
    for (const tier of this.tiers) {
      const ids = new Set(tier.features.map((f) => f.featureId));
      this.tierAssignmentDraft.set(tier.id, new Set(ids));
      this.tierAssignmentSaved.set(tier.id, new Set(ids));
    }
  }

  private getSelectedTierOrAlert(): LicenseTierView | null {
    const tierId = String(this.selectedTierId || '').trim();
    if (!tierId) {
      this.error = 'Select a tier from the dropdown first.';
      return null;
    }
    const tier = this.tiers.find((t) => String(t.id) === tierId);
    if (!tier) {
      this.error = 'Selected tier is no longer available. Refresh and try again.';
      return null;
    }
    return tier;
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
    event.stopPropagation();
    if (!feature.isActive || this.isTogglePending(tier.id, feature.id) || this.bulkTierAction) {
      return;
    }

    if (tier.id === this.selectedTierId) {
      const draft = new Set(this.tierAssignmentDraft.get(tier.id) ?? []);
      if (draft.has(feature.id)) {
        draft.delete(feature.id);
      } else {
        draft.add(feature.id);
      }
      this.tierAssignmentDraft.set(tier.id, draft);
      this.cdr.markForCheck();
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
        this.syncDraftFromTiers();
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

  /**
   * Applies every active feature to the selected tier draft, then persists only that tier.
   */
  grantAllActiveForSelectedTier(event: Event): void {
    event.stopPropagation();
    const tier = this.getSelectedTierOrAlert();
    if (!tier || this.bulkTierAction) {
      return;
    }

    const draft = new Set<string>();
    for (const f of this.activeFeatures) {
      draft.add(f.id);
    }
    this.tierAssignmentDraft.set(tier.id, draft);
    this.cdr.markForCheck();

    if (
      !confirm(
        `Save all ${this.activeFeatures.length} active feature(s) to ${tier.displayName}? Other tiers will not change.`
      )
    ) {
      return;
    }

    this.saveSelectedTierAssignments();
  }

  saveSelectedTierAssignments(): void {
    const tier = this.getSelectedTierOrAlert();
    if (!tier || this.bulkTierAction) {
      return;
    }

    const tierId = tier.id;
    const draft = this.tierAssignmentDraft.get(tierId) ?? new Set<string>();
    const saved = this.tierAssignmentSaved.get(tierId) ?? new Set<string>();
    const toGrant = [...draft].filter((id) => !saved.has(id));
    const toRevoke = [...saved].filter((id) => !draft.has(id));

    if (!toGrant.length && !toRevoke.length) {
      this.showSuccess(`${tier.displayName} is already up to date`);
      return;
    }

    this.bulkTierAction = tierId;
    this.error = '';
    this.runBulkTierSync(tier, toGrant, toRevoke);
  }

  clearSelectedTier(event: Event): void {
    event.stopPropagation();
    const tier = this.getSelectedTierOrAlert();
    if (!tier || this.bulkTierAction) {
      return;
    }

    const draft = this.tierAssignmentDraft.get(tier.id) ?? new Set<string>();
    if (!draft.size) {
      this.showSuccess(`${tier.displayName} has no features to clear`);
      return;
    }

    if (
      !confirm(
        `Remove all features from ${tier.displayName}? Schools on this tier will lose access immediately.`
      )
    ) {
      return;
    }

    this.tierAssignmentDraft.set(tier.id, new Set());
    this.saveSelectedTierAssignments();
  }

  private runBulkTierSync(tier: LicenseTierView, toGrant: string[], toRevoke: string[]): void {
    const tierId = tier.id;
    let revokeIndex = 0;

    const runRevokes = (): void => {
      if (revokeIndex >= toRevoke.length) {
        runGrants(0);
        return;
      }
      const featureId = toRevoke[revokeIndex];
      this.licenseAdmin.revokeTierFeature(tierId, featureId).subscribe({
        next: () => {
          revokeIndex += 1;
          runRevokes();
        },
        error: (err) => {
          this.bulkTierAction = null;
          this.error = err?.error?.message || 'Failed while removing features from tier';
          this.reloadTiersAndAudit();
          this.cdr.markForCheck();
        }
      });
    };

    const runGrants = (grantIndex: number): void => {
      if (grantIndex >= toGrant.length) {
        this.bulkTierAction = null;
        this.showSuccess(`Saved ${tier.displayName} tier assignments`);
        this.licenseService.refresh().subscribe({ error: () => undefined });
        this.reloadTiersAndAudit();
        this.cdr.markForCheck();
        return;
      }
      const featureId = toGrant[grantIndex];
      this.licenseAdmin.grantTierFeature(tierId, featureId).subscribe({
        next: () => {
          runGrants(grantIndex + 1);
        },
        error: (err) => {
          this.bulkTierAction = null;
          this.error = err?.error?.message || 'Failed while granting features to tier';
          this.reloadTiersAndAudit();
          this.cdr.markForCheck();
        }
      });
    };

    if (toRevoke.length) {
      runRevokes();
    } else {
      runGrants(0);
    }
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
