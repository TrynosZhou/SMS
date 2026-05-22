import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { activatePageLoad } from '../../../utils/route-activation';

export type IntegrationStatus = 'active' | 'inactive' | 'error';

export interface IntegrationConfiguration {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  webhookUrl: string;
}

export interface IntegrationItem {
  id: string;
  name: string;
  integrationType: string;
  description: string;
  testSandboxMode: boolean;
  configuration: IntegrationConfiguration;
  status: IntegrationStatus;
  createdAt: string;
}

const STORAGE_KEY = 'sms_integrations';

@Component({
  standalone: false,
  selector: 'app-integrations',
  templateUrl: './integrations.component.html',
  styleUrls: ['./integrations.component.css']
})
export class IntegrationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly integrationTypes = ['API', 'Webhook', 'OAuth', 'SMTP', 'SMS', 'Payment Gateway'];

  integrations: IntegrationItem[] = [];
  loading = false;
  showAddModal = false;
  configSectionExpanded = true;
  saving = false;
  formError = '';

  addForm = {
    integrationType: 'API',
    name: '',
    description: '',
    testSandboxMode: false,
    configuration: {
      apiKey: '',
      apiSecret: '',
      baseUrl: '',
      webhookUrl: ''
    }
  };

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    activatePageLoad(this.router, this.destroy$, '/system/integrations', () => this.loadIntegrations());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get stats() {
    const list = this.integrations;
    return {
      total: list.length,
      active: list.filter(i => i.status === 'active').length,
      inactive: list.filter(i => i.status === 'inactive').length,
      errors: list.filter(i => i.status === 'error').length
    };
  }

  get canCreate(): boolean {
    return !!(this.addForm.integrationType?.trim() && this.addForm.name?.trim());
  }

  loadIntegrations(): void {
    this.loading = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      this.integrations = Array.isArray(parsed)
        ? parsed.map((item: any) => this.normalizeItem(item))
        : [];
    } catch {
      this.integrations = [];
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  private emptyConfiguration(): IntegrationConfiguration {
    return { apiKey: '', apiSecret: '', baseUrl: '', webhookUrl: '' };
  }

  private normalizeConfiguration(raw: any): IntegrationConfiguration {
    const cfg = raw || {};
    return {
      apiKey: cfg.apiKey || '',
      apiSecret: cfg.apiSecret || '',
      baseUrl: cfg.baseUrl || '',
      webhookUrl: cfg.webhookUrl || ''
    };
  }

  private normalizeItem(item: any): IntegrationItem {
    return {
      id: item.id || `int_${Date.now()}`,
      name: item.name || '',
      integrationType: item.integrationType || item.provider || 'API',
      description: item.description || '',
      testSandboxMode: !!item.testSandboxMode,
      configuration: this.normalizeConfiguration(item.configuration),
      status: item.status || 'inactive',
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  toggleConfigSection(): void {
    this.configSectionExpanded = !this.configSectionExpanded;
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.integrations));
  }

  openAddModal(): void {
    this.formError = '';
    this.addForm = {
      integrationType: 'API',
      name: '',
      description: '',
      testSandboxMode: false,
      configuration: this.emptyConfiguration()
    };
    this.configSectionExpanded = true;
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
    this.formError = '';
  }

  createIntegration(): void {
    if (!this.canCreate) {
      return;
    }

    const name = this.addForm.name.trim();
    const integrationType = this.addForm.integrationType.trim();

    this.saving = true;
    const item: IntegrationItem = {
      id: `int_${Date.now()}`,
      name,
      integrationType,
      description: (this.addForm.description || '').trim(),
      testSandboxMode: this.addForm.testSandboxMode,
      configuration: {
        apiKey: (this.addForm.configuration.apiKey || '').trim(),
        apiSecret: (this.addForm.configuration.apiSecret || '').trim(),
        baseUrl: (this.addForm.configuration.baseUrl || '').trim(),
        webhookUrl: (this.addForm.configuration.webhookUrl || '').trim()
      },
      status: 'inactive',
      createdAt: new Date().toISOString()
    };
    this.integrations = [item, ...this.integrations];
    this.persist();
    this.saving = false;
    this.closeAddModal();
    this.cdr.markForCheck();
  }

  removeIntegration(id: string): void {
    if (!confirm('Remove this integration?')) {
      return;
    }
    this.integrations = this.integrations.filter(i => i.id !== id);
    this.persist();
    this.cdr.markForCheck();
  }

  statusLabel(status: IntegrationStatus): string {
    switch (status) {
      case 'active':
        return 'Active';
      case 'error':
        return 'Error';
      default:
        return 'Inactive';
    }
  }
}
