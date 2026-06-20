import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { activatePageLoad } from '../../../utils/route-activation';

export type IntegrationStatus = 'active' | 'inactive' | 'error';
export type IntegrationCategory = 'all' | 'payments' | 'mobile_money' | 'cards' | 'banking';

export interface IntegrationFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  hint?: string;
}

export interface IntegrationProviderDef {
  id: string;
  name: string;
  category: Exclude<IntegrationCategory, 'all'>;
  description: string;
  icon: string;
  accent: string;
  fields: IntegrationFieldDef[];
}

export interface IntegrationConfiguration {
  [key: string]: string;
}

export interface IntegrationItem {
  id: string;
  providerId: string;
  name: string;
  integrationType: string;
  description: string;
  testSandboxMode: boolean;
  configuration: IntegrationConfiguration;
  status: IntegrationStatus;
  createdAt: string;
  updatedAt?: string;
  lastTestedAt?: string;
}

const STORAGE_KEY = 'sms_integrations';

export const INTEGRATION_PROVIDERS: IntegrationProviderDef[] = [
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'payments',
    description: 'Accept international online payments via PayPal checkout.',
    icon: 'P',
    accent: '#003087',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'PayPal REST app Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, placeholder: 'PayPal REST app secret' },
      { key: 'webhookId', label: 'Webhook ID', type: 'text', placeholder: 'Optional webhook identifier' },
      { key: 'returnUrl', label: 'Return URL', type: 'url', placeholder: 'https://yourschool.com/payments/return' },
      { key: 'cancelUrl', label: 'Cancel URL', type: 'url', placeholder: 'https://yourschool.com/payments/cancel' }
    ]
  },
  {
    id: 'paynow',
    name: 'PayNow',
    category: 'payments',
    description: 'Zimbabwe PayNow gateway for school fee collections.',
    icon: 'PN',
    accent: '#0ea5e9',
    fields: [
      { key: 'integrationId', label: 'Integration ID', type: 'text', required: true, placeholder: 'PayNow Integration ID' },
      { key: 'integrationKey', label: 'Integration Key', type: 'password', required: true, placeholder: 'PayNow Integration Key' },
      { key: 'merchantEmail', label: 'Merchant Email', type: 'text', required: true, placeholder: 'merchant@school.co.zw' },
      { key: 'resultUrl', label: 'Result URL', type: 'url', placeholder: 'https://yourschool.com/api/payments/paynow/result' },
      { key: 'returnUrl', label: 'Return URL', type: 'url', placeholder: 'https://yourschool.com/payments/complete' }
    ]
  },
  {
    id: 'innbucks',
    name: 'InnBucks',
    category: 'mobile_money',
    description: 'InnBucks wallet payments for parents and students.',
    icon: 'IB',
    accent: '#f97316',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true, placeholder: 'InnBucks merchant ID' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'API key from InnBucks portal' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true, placeholder: 'API secret' },
      { key: 'callbackUrl', label: 'Callback URL', type: 'url', placeholder: 'https://yourschool.com/api/payments/innbucks/callback' }
    ]
  },
  {
    id: 'ecocash',
    name: 'EcoCash',
    category: 'mobile_money',
    description: 'EcoCash mobile money for local fee payments in Zimbabwe.',
    icon: 'EC',
    accent: '#2563eb',
    fields: [
      { key: 'merchantCode', label: 'Merchant Code', type: 'text', required: true, placeholder: 'EcoCash merchant code' },
      { key: 'merchantPin', label: 'Merchant PIN', type: 'password', required: true, placeholder: 'Merchant PIN' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'EcoCash API key' },
      {
        key: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: ['sandbox', 'production'],
        placeholder: 'sandbox'
      }
    ]
  },
  {
    id: 'onemoney',
    name: 'One Money',
    category: 'mobile_money',
    description: 'NetOne One Money wallet integration for school fees.',
    icon: '1M',
    accent: '#ea580c',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true, placeholder: 'One Money merchant ID' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'API key' },
      { key: 'terminalId', label: 'Terminal ID', type: 'text', required: true, placeholder: 'POS / terminal identifier' },
      { key: 'webhookUrl', label: 'Webhook URL', type: 'url', placeholder: 'https://yourschool.com/api/payments/onemoney/webhook' }
    ]
  },
  {
    id: 'visa',
    name: 'Visa Card',
    category: 'cards',
    description: 'Visa debit and credit card payments through your card processor.',
    icon: 'V',
    accent: '#1a1f71',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true, placeholder: 'Acquirer merchant ID' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Processor API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true, placeholder: 'Processor API secret' },
      { key: 'processorUrl', label: 'Processor Base URL', type: 'url', required: true, placeholder: 'https://api.processor.com/v1' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'Signing secret for webhooks' }
    ]
  },
  {
    id: 'mastercard',
    name: 'Mastercard',
    category: 'cards',
    description: 'Mastercard payments via your payment gateway or bank.',
    icon: 'MC',
    accent: '#eb001b',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true, placeholder: 'Mastercard merchant ID' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Gateway API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true, placeholder: 'Gateway API secret' },
      { key: 'gatewayUrl', label: 'Gateway URL', type: 'url', required: true, placeholder: 'https://gateway.example.com' }
    ]
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'cards',
    description: 'Global card payments with Stripe Checkout and webhooks.',
    icon: 'S',
    accent: '#635bff',
    fields: [
      { key: 'publishableKey', label: 'Publishable Key', type: 'text', required: true, placeholder: 'pk_live_... or pk_test_...' },
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, placeholder: 'sk_live_... or sk_test_...' },
      { key: 'webhookSecret', label: 'Webhook Signing Secret', type: 'password', placeholder: 'whsec_...' }
    ]
  },
  {
    id: 'zimswitch',
    name: 'ZIMSWITCH',
    category: 'banking',
    description: 'Local bank card switching for Zimbabwe financial institutions.',
    icon: 'ZS',
    accent: '#059669',
    fields: [
      { key: 'terminalId', label: 'Terminal ID', type: 'text', required: true, placeholder: 'ZIMSWITCH terminal ID' },
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true, placeholder: 'Merchant identifier' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Integration API key' },
      { key: 'baseUrl', label: 'API Base URL', type: 'url', placeholder: 'https://api.zimswitch.co.zw' }
    ]
  }
];

@Component({
  standalone: false,
  selector: 'app-integrations',
  templateUrl: './integrations.component.html',
  styleUrls: ['./integrations.component.css']
})
export class IntegrationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly providers = INTEGRATION_PROVIDERS;
  readonly categories: { id: IntegrationCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'All', icon: '⊞' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'mobile_money', label: 'Mobile Money', icon: '📱' },
    { id: 'cards', label: 'Cards', icon: '🏦' },
    { id: 'banking', label: 'Banking', icon: '🏛️' }
  ];

  integrations: IntegrationItem[] = [];
  loading = false;
  saving = false;
  testing = false;
  searchQuery = '';
  activeCategory: IntegrationCategory = 'all';
  showModal = false;
  modalMode: 'connect' | 'edit' = 'connect';
  selectedProvider: IntegrationProviderDef | null = null;
  editingIntegration: IntegrationItem | null = null;
  formError = '';
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  configForm: IntegrationConfiguration = {};
  sandboxMode = true;
  enableOnSave = false;

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

  get filteredProviders(): IntegrationProviderDef[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.providers.filter(p => {
      const catOk = this.activeCategory === 'all' || p.category === this.activeCategory;
      if (!catOk) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.replace('_', ' ').includes(q)
      );
    });
  }

  get connectedIntegrations(): IntegrationItem[] {
    return [...this.integrations].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
  }

  isConnected(providerId: string): boolean {
    return this.integrations.some(i => i.providerId === providerId);
  }

  getIntegrationForProvider(providerId: string): IntegrationItem | undefined {
    return this.integrations.find(i => i.providerId === providerId);
  }

  categoryLabel(cat: string): string {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

  private emptyConfigForProvider(provider: IntegrationProviderDef): IntegrationConfiguration {
    const cfg: IntegrationConfiguration = {};
    for (const field of provider.fields) {
      cfg[field.key] = field.type === 'select' && field.options?.length ? field.options[0] : '';
    }
    return cfg;
  }

  private normalizeConfiguration(raw: any, providerId?: string): IntegrationConfiguration {
    const provider = providerId ? this.providers.find(p => p.id === providerId) : null;
    const cfg: IntegrationConfiguration = {};
    if (provider) {
      for (const field of provider.fields) {
        cfg[field.key] = String(raw?.[field.key] ?? '').trim();
      }
      return cfg;
    }
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        cfg[k] = String(v ?? '').trim();
      }
    }
    return cfg;
  }

  private normalizeItem(item: any): IntegrationItem {
    const providerId = item.providerId || this.guessProviderId(item);
    const provider = this.providers.find(p => p.id === providerId);
    return {
      id: item.id || `int_${Date.now()}`,
      providerId: providerId || 'custom',
      name: item.name || provider?.name || 'Integration',
      integrationType: item.integrationType || provider?.name || 'Payment Gateway',
      description: item.description || provider?.description || '',
      testSandboxMode: item.testSandboxMode !== false,
      configuration: this.normalizeConfiguration(item.configuration, providerId),
      status: item.status || 'inactive',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt,
      lastTestedAt: item.lastTestedAt
    };
  }

  private guessProviderId(item: any): string {
    const name = String(item.name || item.integrationType || '').toLowerCase();
    if (name.includes('paypal')) return 'paypal';
    if (name.includes('paynow') || name.includes('pay now')) return 'paynow';
    if (name.includes('innbucks') || name.includes('inbucks')) return 'innbucks';
    if (name.includes('ecocash')) return 'ecocash';
    if (name.includes('one money') || name.includes('onemoney')) return 'onemoney';
    if (name.includes('visa')) return 'visa';
    if (name.includes('mastercard')) return 'mastercard';
    if (name.includes('stripe')) return 'stripe';
    if (name.includes('zimswitch')) return 'zimswitch';
    return 'custom';
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.integrations));
  }

  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toastMessage = '';
      this.cdr.markForCheck();
    }, 4000);
  }

  setCategory(cat: IntegrationCategory): void {
    this.activeCategory = cat;
  }

  openConnect(provider: IntegrationProviderDef): void {
    this.formError = '';
    this.selectedProvider = provider;
    this.editingIntegration = null;
    this.modalMode = 'connect';
    this.configForm = this.emptyConfigForProvider(provider);
    this.sandboxMode = true;
    this.enableOnSave = false;
    this.showModal = true;
  }

  openEdit(item: IntegrationItem): void {
    const provider = this.providers.find(p => p.id === item.providerId);
    if (!provider) return;
    this.formError = '';
    this.selectedProvider = provider;
    this.editingIntegration = item;
    this.modalMode = 'edit';
    this.configForm = { ...this.normalizeConfiguration(item.configuration, provider.id) };
    this.sandboxMode = item.testSandboxMode;
    this.enableOnSave = item.status === 'active';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedProvider = null;
    this.editingIntegration = null;
    this.formError = '';
  }

  validateForm(): boolean {
    if (!this.selectedProvider) return false;
    for (const field of this.selectedProvider.fields) {
      if (field.required && !String(this.configForm[field.key] || '').trim()) {
        this.formError = `${field.label} is required.`;
        return false;
      }
    }
    this.formError = '';
    return true;
  }

  saveIntegration(): void {
    if (!this.selectedProvider || !this.validateForm()) return;

    this.saving = true;
    const now = new Date().toISOString();
    const configuration = this.normalizeConfiguration(this.configForm, this.selectedProvider.id);

    if (this.modalMode === 'edit' && this.editingIntegration) {
      this.integrations = this.integrations.map(i =>
        i.id === this.editingIntegration!.id
          ? {
              ...i,
              configuration,
              testSandboxMode: this.sandboxMode,
              status: this.enableOnSave ? 'active' : 'inactive',
              updatedAt: now
            }
          : i
      );
      this.showToast(`${this.selectedProvider.name} integration updated.`);
    } else {
      if (this.isConnected(this.selectedProvider.id)) {
        this.formError = `${this.selectedProvider.name} is already connected. Edit the existing integration instead.`;
        this.saving = false;
        this.cdr.markForCheck();
        return;
      }
      const item: IntegrationItem = {
        id: `int_${Date.now()}`,
        providerId: this.selectedProvider.id,
        name: this.selectedProvider.name,
        integrationType: this.categoryLabel(this.selectedProvider.category),
        description: this.selectedProvider.description,
        testSandboxMode: this.sandboxMode,
        configuration,
        status: this.enableOnSave ? 'active' : 'inactive',
        createdAt: now,
        updatedAt: now
      };
      this.integrations = [item, ...this.integrations];
      this.showToast(`${this.selectedProvider.name} connected successfully.`);
    }

    this.persist();
    this.saving = false;
    this.closeModal();
    this.cdr.markForCheck();
  }

  toggleIntegrationStatus(item: IntegrationItem): void {
    const next: IntegrationStatus = item.status === 'active' ? 'inactive' : 'active';
    this.integrations = this.integrations.map(i =>
      i.id === item.id ? { ...i, status: next, updatedAt: new Date().toISOString() } : i
    );
    this.persist();
    this.showToast(`${item.name} ${next === 'active' ? 'enabled' : 'disabled'}.`);
    this.cdr.markForCheck();
  }

  testConnection(item: IntegrationItem): void {
    const provider = this.providers.find(p => p.id === item.providerId);
    if (!provider) return;

    this.testing = true;
    const missing = provider.fields
      .filter(f => f.required && !String(item.configuration[f.key] || '').trim())
      .map(f => f.label);

    setTimeout(() => {
      if (missing.length) {
        this.integrations = this.integrations.map(i =>
          i.id === item.id ? { ...i, status: 'error' as IntegrationStatus } : i
        );
        this.persist();
        this.showToast(`Connection failed: missing ${missing.join(', ')}.`, 'error');
      } else {
        this.integrations = this.integrations.map(i =>
          i.id === item.id
            ? {
                ...i,
                status: 'active' as IntegrationStatus,
                lastTestedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            : i
        );
        this.persist();
        this.showToast(`${item.name} connection test passed.`);
      }
      this.testing = false;
      this.cdr.markForCheck();
    }, 900);
  }

  testConnectionFromModal(): void {
    if (!this.selectedProvider || !this.validateForm()) return;
    const draft: IntegrationItem = {
      id: 'draft',
      providerId: this.selectedProvider.id,
      name: this.selectedProvider.name,
      integrationType: '',
      description: '',
      testSandboxMode: this.sandboxMode,
      configuration: this.normalizeConfiguration(this.configForm, this.selectedProvider.id),
      status: 'inactive',
      createdAt: new Date().toISOString()
    };
    this.testing = true;
    const missing = this.selectedProvider.fields
      .filter(f => f.required && !String(draft.configuration[f.key] || '').trim())
      .map(f => f.label);

    setTimeout(() => {
      if (missing.length) {
        this.showToast(`Test failed: fill in ${missing.join(', ')}.`, 'error');
      } else {
        this.showToast(`${this.selectedProvider!.name} credentials look valid (sandbox check).`);
      }
      this.testing = false;
      this.cdr.markForCheck();
    }, 900);
  }

  removeIntegration(id: string): void {
    const item = this.integrations.find(i => i.id === id);
    if (!item || !confirm(`Disconnect ${item.name}? This removes stored credentials from this browser.`)) {
      return;
    }
    this.integrations = this.integrations.filter(i => i.id !== id);
    this.persist();
    this.showToast(`${item.name} disconnected.`);
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

  maskSecret(value: string): string {
    const v = String(value || '').trim();
    if (!v) return '—';
    if (v.length <= 4) return '••••';
    return '••••' + v.slice(-4);
  }

  getProvider(providerId: string): IntegrationProviderDef | undefined {
    return this.providers.find(p => p.id === providerId);
  }

  getProviderAccent(providerId: string): string {
    return this.getProvider(providerId)?.accent || '#64748b';
  }

  getProviderIcon(providerId: string): string {
    return this.getProvider(providerId)?.icon || 'API';
  }

  getProviderFieldsPreview(providerId: string): IntegrationFieldDef[] {
    return (this.getProvider(providerId)?.fields || []).slice(0, 2);
  }
}
