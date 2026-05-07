// src/app/features/superadmin/sa-billing/sa-billing.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { SuperAdminService } from '../../services/superadmin.service';
import { ConstantsService }  from '../../services/constants.service';
import {
  ShopListItemDto, PagedShopsDto,
  PaymentHistoryItemDto, PagedPaymentsDto,
  CreatePaymentRequest, UpdatePaymentRequest,
  PaymentStatus,
} from '../../models/superadmin.models';

@Component({
  selector:    'app-sa-billing',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './sa-billing.component.html',
  styleUrls:   ['.././sa-shared.css'],
})
export class SaBillingComponent implements OnInit {

  private readonly cSvc = inject(ConstantsService);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  activeTab = signal<'pay' | 'history'>('pay');
  readonly tabs = [
    { id: 'pay',     label: 'New Payment',     icon: 'bi-credit-card'   },
    { id: 'history', label: 'Payment History', icon: 'bi-clock-history' },
  ] as const;

  // ── Toast ──────────────────────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  // ── Plan data from ConstantsService ───────────────────────────────────────
  get plans(): string[]                          { return this.cSvc.subscriptionPlanValues(); }
  get planFeatures(): Record<string, string[]>   { return this.cSvc.planFeatures();           }
  get planMonthlyRates(): Record<string, number> { return this.cSvc.planMonthlyRates();       }

  /**
   * Only plans that have a configured monthly rate OR at least one feature in the DB.
   * This prevents ghost plan buttons (e.g. Free/Pro) appearing when only Basic is set up.
   */
  activePlans = computed((): string[] => {
    const rates    = this.cSvc.planMonthlyRates();
    const features = this.cSvc.planFeatures();
    return this.cSvc.subscriptionPlanValues().filter(
      p => rates[p] !== undefined || (features[p]?.length ?? 0) > 0
    );
  });

  // ── Shared lookups ─────────────────────────────────────────────────────────
  readonly shopFilters = [
    { val: 'all',      label: 'All'      },
    { val: 'expired',  label: 'Expired'  },
    { val: 'expiring', label: 'Expiring' },
    { val: 'active',   label: 'Active'   },
  ] as const;

  readonly durations = [
    { months: 1,  label: '1 Month'  },
    { months: 3,  label: '3 Months' },
    { months: 6,  label: '6 Months' },
    { months: 12, label: '1 Year'   },
  ];

  readonly paymentStatuses: {
    val: PaymentStatus; label: string; icon: string; hint: string;
  }[] = [
    { val: 'Paid',    label: 'Paid',    icon: 'bi-check-circle-fill', hint: 'Payment received — subscription updated immediately' },
    { val: 'Pending', label: 'Pending', icon: 'bi-clock-fill',        hint: 'Awaiting payment — subscription NOT updated yet'     },
    { val: 'Failed',  label: 'Failed',  icon: 'bi-x-circle-fill',     hint: 'Payment failed — subscription NOT updated'           },
  ];

  // ── Shops ──────────────────────────────────────────────────────────────────
  allShops      = signal<ShopListItemDto[]>([]);
  shopsLoading  = signal(true);
  shopSearch    = signal('');
  shopFilterTab = signal<'all' | 'expired' | 'expiring' | 'active'>('all');

  filteredShops = computed(() => {
    const q   = this.shopSearch().toLowerCase();
    const tab = this.shopFilterTab();
    return this.allShops().filter(s => {
      const matchSearch =
        !q ||
        s.businessName.toLowerCase().includes(q) ||
        (s.ownerName     ?? '').toLowerCase().includes(q) ||
        (s.businessPhone ?? '').includes(q);
      const matchTab =
        tab === 'all'      ? true :
        tab === 'expired'  ? (s.daysLeft < 0 || !s.isActive) :
        tab === 'expiring' ? (s.daysLeft >= 0 && s.daysLeft <= 30 && s.isActive) :
                             (s.daysLeft > 30 && s.isActive);
      return matchSearch && matchTab;
    });
  });

  // ── New Payment form ───────────────────────────────────────────────────────
  selectedShop          = signal<ShopListItemDto | null>(null);
  selectedPlan          = signal<string>('');
  selectedDuration      = signal<number>(3);
  selectedPaymentStatus = signal<PaymentStatus>('Paid');
  transactionRef        = '';
  payNotes              = '';
  isSaving              = signal(false);
  showConfirm           = signal(false);

  /**
   * Real start date the SP will use:
   * - Active shop  → day after current expiry (stacking)
   * - Expired shop → today
   */
  stackedStart = computed((): Date => {
    const shop  = this.selectedShop();
    const today = this.startOfDay(new Date());
    if (!shop) return today;
    if (shop.daysLeft > 0 && shop.subscriptionExpiry) {
      const expiry = this.startOfDay(new Date(shop.subscriptionExpiry));
      if (!isNaN(expiry.getTime())) {
        const next = new Date(expiry);
        next.setDate(next.getDate() + 1);
        return next;
      }
    }
    return today;
  });

  stackedEnd = computed((): Date => {
    const d = new Date(this.stackedStart());
    d.setMonth(d.getMonth() + this.selectedDuration());
    return d;
  });

  isStacking = computed((): boolean =>
    !!(this.selectedShop()?.daysLeft && this.selectedShop()!.daysLeft > 0)
  );

  computedAmount = computed((): number => {
    const rates = this.cSvc.planMonthlyRates();
    return (rates[this.selectedPlan()] ?? 0) * this.selectedDuration();
  });

  canPay = computed((): boolean =>
    !!this.selectedShop() && !!this.selectedPlan() && this.selectedDuration() >= 1
  );

  payStatusHint = computed((): string =>
    this.paymentStatuses.find(s => s.val === this.selectedPaymentStatus())?.hint ?? ''
  );

  // ── Payment History ────────────────────────────────────────────────────────
  histItems        = signal<PaymentHistoryItemDto[]>([]);
  histTotal        = signal(0);
  histLoading      = signal(false);
  histPage         = signal(1);
  histSearch       = signal('');
  histPlanFilter   = '';
  histStatusFilter = '';
  readonly histPageSize = 15;

  histTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.histTotal() / this.histPageSize))
  );
  histPages = computed(() => {
    const total = this.histTotalPages();
    const cur   = this.histPage();
    const arr: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) arr.push(i);
    return arr;
  });

  // ── Edit Payment modal ─────────────────────────────────────────────────────
  showEditModal = signal(false);
  editTarget    = signal<PaymentHistoryItemDto | null>(null);
  editPlan      = signal<string>('');
  editStatus    = signal<PaymentStatus>('Paid');
  isEditSaving  = signal(false);

  editStatusHint = computed((): string =>
    this.paymentStatuses.find(s => s.val === this.editStatus())?.hint ?? ''
  );

  /** True when changing Paid → Pending/Failed — subscription will be reverted */
  editIsReverting = computed((): boolean =>
    this.editTarget()?.paymentStatus === 'Paid' && this.editStatus() !== 'Paid'
  );

  /** True when nothing changed — Save button shows "No Changes" and closes silently */
  editUnchanged = computed((): boolean => {
    const t = this.editTarget();
    return !!t && this.editPlan() === t.plan && this.editStatus() === t.paymentStatus;
  });

  constructor(private svc: SuperAdminService) {}

  ngOnInit(): void {
    this.loadAllShops();
    this.loadHistory();
  }

  // ── Shops ──────────────────────────────────────────────────────────────────
  loadAllShops(): void {
    this.shopsLoading.set(true);
    this.svc.getShops({ page: 1, pageSize: 200 }).subscribe({
      next: (p: PagedShopsDto) => {
        this.allShops.set(p.items);
        this.shopsLoading.set(false);
      },
      error: (e: Error) => {
        this.toast(e.message, 'error');
        this.shopsLoading.set(false);
      },
    });
  }

  selectShop(shop: ShopListItemDto): void {
    this.selectedShop.set(shop);
    this.selectedDuration.set(3);
    // Auto-select first active plan if none selected yet
    if (!this.selectedPlan() && this.activePlans().length > 0) {
      this.selectedPlan.set(this.activePlans()[0]);
    }
  }

  selectDuration(months: number): void { this.selectedDuration.set(months); }

  // ── New Payment ────────────────────────────────────────────────────────────
  openConfirm(): void { if (this.canPay()) this.showConfirm.set(true); }

  submitPayment(): void {
    const shop = this.selectedShop();
    if (!shop || !this.canPay()) return;

    this.isSaving.set(true);
    const req: CreatePaymentRequest = {
      businessAccountId: shop.businessAccountId,
      plan:              this.selectedPlan(),
      durationMonths:    this.selectedDuration(),
      amount:            this.computedAmount(),
      currency:          'INR',
      paymentStatus:     this.selectedPaymentStatus(),
      transactionRef:    this.transactionRef || undefined,
      notes:             this.payNotes       || undefined,
    };

    this.svc.createPayment(req).subscribe({
      next: () => {
        this.toast(`Payment recorded for ${shop.businessName}.`, 'success');
        this.showConfirm.set(false);
        this.isSaving.set(false);
        this.resetForm();
        this.loadAllShops();
        this.loadHistory();
      },
      error: (e: Error) => { this.toast(e.message, 'error'); this.isSaving.set(false); },
    });
  }

  private resetForm(): void {
    this.selectedShop.set(null);
    this.selectedPlan.set(this.activePlans()[0] ?? '');
    this.selectedDuration.set(3);
    this.selectedPaymentStatus.set('Paid');
    this.transactionRef = '';
    this.payNotes       = '';
  }

  // ── History ────────────────────────────────────────────────────────────────
  loadHistory(): void {
    this.histLoading.set(true);
    this.svc.getPayments({
      page:     this.histPage(),
      pageSize: this.histPageSize,
      plan:     this.histPlanFilter   || undefined,
      status:   this.histStatusFilter || undefined,
    }).subscribe({
      next: (paged: PagedPaymentsDto) => {
        const q        = this.histSearch().toLowerCase();
        const filtered = q
          ? paged.items.filter(i => i.businessName.toLowerCase().includes(q))
          : paged.items;
        this.histItems.set(filtered);
        this.histTotal.set(paged.totalCount);
        this.histLoading.set(false);
      },
      error: (e: Error) => { this.toast(e.message, 'error'); this.histLoading.set(false); },
    });
  }

  histGoTo(p: number): void {
    if (p >= 1 && p <= this.histTotalPages()) {
      this.histPage.set(p);
      this.loadHistory();
    }
  }

  // ── Edit Payment ───────────────────────────────────────────────────────────
  openEdit(item: PaymentHistoryItemDto): void {
    this.editTarget.set(item);
    this.editPlan.set(item.plan);
    this.editStatus.set(item.paymentStatus);
    this.isEditSaving.set(false);
    this.showEditModal.set(true);
  }

  closeEdit(): void {
    this.showEditModal.set(false);
    this.editTarget.set(null);
  }

  submitEdit(): void {
    const item = this.editTarget();
    if (!item) return;

    // Nothing changed — silently close
    if (this.editUnchanged()) { this.closeEdit(); return; }

    this.isEditSaving.set(true);
    const req: UpdatePaymentRequest = {
      plan:          this.editPlan(),
      paymentStatus: this.editStatus(),
    };

    this.svc.updatePayment(item.paymentId, req).subscribe({
      next: (updated: PaymentHistoryItemDto) => {
        // Patch row in-place — no full reload needed
        this.histItems.update(list =>
          list.map(i => i.paymentId === updated.paymentId ? updated : i)
        );
        this.toast(`Payment #${updated.paymentId} updated successfully.`, 'success');
        this.isEditSaving.set(false);
        this.closeEdit();
        this.loadAllShops(); // refresh shop badges
      },
      error: (e: Error) => { this.toast(e.message, 'error'); this.isEditSaving.set(false); },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3500);
  }

  fmtDate(val: string | Date | null | undefined): string {
    if (!val) return '—';
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fmtDateTime(val: string | null | undefined): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarColor(id: number): string {
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444'][id % 7];
  }

  planClass(plan: string): string {
    return plan === 'Pro' ? 'plan-pro' : plan === 'Basic' ? 'plan-basic' : 'plan-free';
  }

  payStatusClass(status: string): string {
    return status === 'Paid'    ? 'pay-success'
         : status === 'Pending' ? 'pay-pending'
         :                        'pay-failed';
  }

  private startOfDay(d: Date): Date {
    d.setHours(0, 0, 0, 0);
    return d;
  }
}