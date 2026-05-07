// src/app/features/settings/settings.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SharedStateService, BusinessSettings, Permission, UserRole, GstType, ShopType,
} from '../../services/shared-state.service';
import { ConstantsService } from '../../services/constants.service';

@Component({
  selector:    'app-settings',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls:   ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {

  private readonly cSvc = inject(ConstantsService);

  settings    = signal<BusinessSettings | null>(null);
  isLoading   = signal(true);
  isSaving    = signal(false);
  isExporting = signal(false);

  form: Partial<Omit<BusinessSettings, 'shopType'> & {
    shopType: string;
    gstEnabled: boolean; gstType: GstType;
    cgstRate: number; sgstRate: number; igstRate: number;
    showGstOnInvoice: boolean;
    logoUrl: string; showLogoOnInvoice: boolean;
    invoiceShowTime: boolean;
  }> = {};

  activeSection = signal<'business' | 'theme' | 'invoice' | 'permissions' | 'plan' | 'data'>('business');

  // ── Template uses: *ngFor="let type of shopTypes"
  //    then: form.shopType === type   (string === string ✓)
  //          form.shopType = type     (assign string ✓)
  //          shopTypeIcons[type]      (string index ✓)
  //          {{ type }}               (string display ✓)
  // shopTypes MUST be string[] — NOT AppConstantItem[]
  get shopTypes(): string[]             { return this.cSvc.shopTypeValues(); }

  // Template: shopTypeIcons[type]  where type is string
  get shopTypeIcons(): Record<string, string> { return this.cSvc.shopTypeIconMap(); }

  // Template: *ngFor="let c of themeColors"  then c.value / c.label
  get themeColors()     { return this.cSvc.themeColors(); }      // AppConstantItem[]

  // Template: *ngFor="let c of currencyOptions"  then c.value / c.label
  get currencyOptions() { return this.cSvc.currencies(); }       // AppConstantItem[]

  // Template: *ngFor="let opt of gstTypeOptions"  then opt.value / opt.label
  get gstTypeOptions()  { return this.cSvc.gstTypes(); }         // AppConstantItem[]

  // Template: *ngFor="let plan of plans"  then {{ plan }} and planFeatures[plan]
  get plans(): string[] { return this.cSvc.subscriptionPlanValues(); }

  // Template: planFeatures[plan]  — plain object, NO ()
  get planFeatures(): Record<string, string[]> { return this.cSvc.planFeatures(); }

  get planMonthlyRates(): Record<string, number> { return this.cSvc.planMonthlyRates(); }
  
  // Template: *ngFor="let module of allModules"  and allModules.length
  // Must be a plain string[] property — template uses allModules.length (NO ())
  get allModules(): string[] { return this.cSvc.appModuleValues(); }

  // ── Template calls these WITH () — must be signals (computed) ────────────

  // Template: [class]="selectedShopTypeIcon()"
  readonly selectedShopTypeIcon = computed(() => {
    const t = this.form.shopType as ShopType;
    return t ? (this.cSvc.shopTypeIconMap()[t] ?? 'bi-shop') : 'bi-shop';
  });

  // Template: {{ previewCurrencySymbol() }}
  readonly previewCurrencySymbol = computed(() => {
    const match = this.cSvc.currencies().find(c => c.value === this.form.currency);
    return match?.icon ?? '₹';
  });

  // Template: totalGstRate() — not used directly in provided HTML but kept for safety
  readonly totalGstRate = computed(() => {
    if (this.form.gstType === 'GST')  return (this.form.cgstRate ?? 0) + (this.form.sgstRate ?? 0);
    if (this.form.gstType === 'IGST') return this.form.igstRate ?? 0;
    return 0;
  });

  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  showClearConfirm = signal(false);
  clearConfirmText = signal('');

  editingRole   = signal<UserRole>('Admin');
  adminPerms    = signal<Permission[]>([]);
  workerPerms   = signal<Permission[]>([]);
  isSavingPerms = signal(false);

  logoPreview   = signal<string>('');
  logoUploading = signal(false);

  // Template: visibleCount() and activePerms() — signals
  activePerms  = computed(() => this.editingRole() === 'Admin' ? this.adminPerms() : this.workerPerms());
  visibleCount = computed(() => this.activePerms().filter(p => p.canView).length);

  constructor(private shared: SharedStateService) {}

  ngOnInit(): void {
    this.shared.getSettings().subscribe({
      next: d => {
        this.settings.set(d);
        this.form = {
          ...d,
          gstEnabled:        (d as any).gstEnabled        ?? false,
          gstType:           (d as any).gstType            ?? 'None',
          cgstRate:          (d as any).cgstRate           ?? 2.5,
          sgstRate:          (d as any).sgstRate           ?? 2.5,
          igstRate:          (d as any).igstRate           ?? 5,
          showGstOnInvoice:  (d as any).showGstOnInvoice   ?? true,
          logoUrl:           (d as any).logoUrl            ?? '',
          showLogoOnInvoice: (d as any).showLogoOnInvoice  ?? true,
          invoiceShowTime:   (d as any).invoiceShowTime    ?? false,
        };
        this.logoPreview.set((d as any).logoUrl ?? '');
        this.isLoading.set(false);
        this.shared.applyThemeToDom(d.themeColor);

        const templates = this.shared.getRoleTemplates();
        const admin  = templates.find(t => t.role === 'Admin');
        const worker = templates.find(t => t.role === 'Worker');
        if (admin)  this.adminPerms.set(admin.permissions.map(p => ({ ...p })));
        if (worker) this.workerPerms.set(worker.permissions.map(p => ({ ...p })));
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to load settings.', 'error');
        this.isLoading.set(false);
      },
    });
  }

  // Template: trackBy: trackByModule  where module is string
  trackByModule(_index: number, module: string): string { return module; }

  save(): void {
    if (!this.form.businessName?.trim()) { this.toast('Business name is required.', 'error'); return; }
    this.isSaving.set(true);
    this.shared.saveSettings(this.form as any).subscribe({
      next: updated => {
        this.settings.set(updated);
        this.form = { ...this.form, ...updated };
        this.toast('Settings saved successfully.', 'success');
        this.isSaving.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to save settings.', 'error');
        this.isSaving.set(false);
      },
    });
  }

  selectTheme(color: string): void {
    this.form = { ...this.form, themeColor: color };
    this.shared.applyThemeToDom(color);
  }

  onThemeInput(color: string): void {
    this.form = { ...this.form, themeColor: color };
    this.shared.applyThemeToDom(color);
  }

  // Template: (click)="onGstTypeChange(opt.value)"  — opt.value is string
  onGstTypeChange(type: string): void {
    this.form.gstType    = type as GstType;
    this.form.gstEnabled = type !== 'None';
  }

  onCgstChange(val: number): void { this.form.cgstRate = val; this.form.sgstRate = val; }

  onLogoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toast('Please select an image file.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024)    { this.toast('Image must be smaller than 2MB.', 'error'); return; }
    this.logoUploading.set(true);
    const reader = new FileReader();
    reader.onload  = (e) => {
      const d = e.target?.result as string;
      this.form.logoUrl = d;
      this.logoPreview.set(d);
      this.logoUploading.set(false);
    };
    reader.onerror = () => { this.toast('Failed to read image file.', 'error'); this.logoUploading.set(false); };
    reader.readAsDataURL(file);
  }

  removeLogo(): void { this.form.logoUrl = ''; this.logoPreview.set(''); }

  getPermForModule(module: string): Permission {
    return this.activePerms().find(p => p.module === module)
      ?? { module, canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  toggleRolePerm(module: string, action: keyof Omit<Permission, 'module'>): void {
    const update = (list: Permission[]): Permission[] => {
      const exists = list.find(p => p.module === module);
      if (exists) {
        const updated = list.map(p => p.module === module ? { ...p, [action]: !p[action] } : p);
        if (action === 'canView')
          return updated.map(p =>
            p.module === module && !p.canView
              ? { ...p, canCreate: false, canEdit: false, canDelete: false } : p
          );
        return updated;
      }
      return [...list, { module, canView: false, canCreate: false, canEdit: false, canDelete: false, [action]: true }];
    };
    if (this.editingRole() === 'Admin') this.adminPerms.update(update);
    else                                this.workerPerms.update(update);
  }

  resetRoleToDefault(): void {
    const t = this.shared.getRoleTemplates().find(t => t.role === this.editingRole());
    if (!t) return;
    if (this.editingRole() === 'Admin') this.adminPerms.set(t.permissions.map(p => ({ ...p })));
    else                                this.workerPerms.set(t.permissions.map(p => ({ ...p })));
  }

  saveRolePermissions(): void {
    this.isSavingPerms.set(true);
    const role  = this.editingRole();
    const perms = role === 'Admin' ? this.adminPerms() : this.workerPerms();
    this.shared.saveRolePermissions(role, perms).subscribe({
      next:     () => { this.toast(`Permissions saved — all ${role}s updated.`, 'success'); },
      error:    (err: Error) => { this.toast(err.message || 'Failed to save permissions.', 'error'); },
      complete: () => { this.isSavingPerms.set(false); },
    });
  }

  exportData(): void {
    this.isExporting.set(true);
    this.shared.exportData().subscribe({
      next: blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aquaerp-backup-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        this.toast('Data exported successfully.', 'success');
        this.isExporting.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Export failed.', 'error');
        this.isExporting.set(false);
      },
    });
  }

  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3500);
  }

  daysLeft(): number {
    const expiry = this.settings()?.subscriptionExpiry;
    if (!expiry) return 0;
    return Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000));
  }

  subscriptionDuration(): number {
    const s = this.settings();
    if (!s?.subscriptionStartDate || !s?.subscriptionExpiry) return 0;
    return Math.max(0, Math.ceil(
      (new Date(s.subscriptionExpiry).getTime() - new Date(s.subscriptionStartDate).getTime()) / 86_400_000
    ));
  }

  planClass(plan: string): string {
    return ({ Free: 'plan-free', Basic: 'plan-basic', Pro: 'plan-pro' } as any)[plan] || '';
  }

  // Template: moduleIcon(module)
  moduleIcon(module: string): string { return this.cSvc.moduleIconMap()[module] ?? 'bi-circle'; }
}