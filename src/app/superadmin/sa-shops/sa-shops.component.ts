// src/app/features/superadmin/sa-shops/sa-shops.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SuperAdminService } from '../../services/superadmin.service';
import {
  ShopListItemDto, ShopDetailDto, PagedShopsDto,
  UpdateSubscriptionRequest, SubscriptionStatus,
} from '../../models/superadmin.models';

@Component({
  selector:    'app-sa-shops',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './sa-shops.component.html',
  styleUrls:   ['.././sa-shared.css'],
})
export class SaShopsComponent implements OnInit {

  shops      = signal<ShopListItemDto[]>([]);
  totalCount = signal(0);
  isLoading  = signal(true);
  isSaving   = signal(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  searchQuery  = signal('');
  filterPlan   = signal('');
  filterStatus = signal('');
  currentPage  = signal(1);
  readonly pageSize = 10;

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
  pages      = computed(() => {
    const total = this.totalPages(), cur = this.currentPage();
    const arr: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) arr.push(i);
    return arr;
  });

  private searchSubject = new Subject<string>();

  // ── Detail drawer ─────────────────────────────────────────────────────────
  showDrawer    = signal(false);
  drawerShop    = signal<ShopDetailDto | null>(null);
  drawerLoading = signal(false);

  // ── Edit subscription modal ───────────────────────────────────────────────
  showEditModal = signal(false);
  editingShop   = signal<ShopListItemDto | null>(null);
  editForm = {
    subscriptionPlan:      '',
    subscriptionStartDate: '',
    subscriptionExpiry:    '',
  };

  // ── Toast ─────────────────────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  readonly plans    = ['Free', 'Basic', 'Pro'];
  readonly statuses = [
    { value: '',         label: 'All Status'    },
    { value: 'Active',   label: 'Active'        },
    { value: 'Expiring', label: 'Expiring (30d)'},
    { value: 'Expired',  label: 'Expired'       },
  ];

  constructor(private svc: SuperAdminService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => { this.currentPage.set(1); this.loadShops(); });

    this.loadShops();
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  loadShops(): void {
    this.isLoading.set(true);
    this.svc.getShops({
      page:     this.currentPage(),
      pageSize: this.pageSize,
      search:   this.searchQuery().trim() || undefined,
      plan:     this.filterPlan()          || undefined,
      status:   this.filterStatus()        || undefined,
    }).subscribe({
      next: (paged: PagedShopsDto) => {
        this.shops.set(paged.items);
        this.totalCount.set(paged.totalCount);
        this.isLoading.set(false);
      },
      error: (e: Error) => { this.toast(e.message, 'error'); this.isLoading.set(false); },
    });
  }

  onSearch(val: string): void  { this.searchQuery.set(val); this.searchSubject.next(val); }
  onFilterChange(): void       { this.currentPage.set(1); this.loadShops(); }
  goToPage(p: number): void    {
    if (p >= 1 && p <= this.totalPages()) { this.currentPage.set(p); this.loadShops(); }
  }

  trackById(_: number, s: ShopListItemDto): number { return s.businessAccountId; }

  // ── Drawer ────────────────────────────────────────────────────────────────
  openDrawer(shop: ShopListItemDto): void {
    this.showDrawer.set(true);
    this.drawerShop.set(null);
    this.drawerLoading.set(true);
    this.svc.getShopById(shop.businessAccountId).subscribe({
      next:  d  => { this.drawerShop.set(d); this.drawerLoading.set(false); },
      error: () => this.drawerLoading.set(false),
    });
  }

  closeDrawer(): void { this.showDrawer.set(false); }

  // ── Edit subscription modal ───────────────────────────────────────────────
  openEdit(shop: ShopListItemDto | ShopDetailDto, e: Event): void {
    e.stopPropagation();
    // Normalise to list item shape for the editing signal
    const listItem = this._toListItem(shop);
    this.editingShop.set(listItem);
    this.editForm = {
      subscriptionPlan:      shop.subscriptionPlan,
      subscriptionStartDate: this.toDateInput(shop.subscriptionStartDate),
      subscriptionExpiry:    this.toDateInput(shop.subscriptionExpiry),
    };
    this.showEditModal.set(true);
  }

  closeEdit(): void { this.showEditModal.set(false); }

  saveSubscription(): void {
    const shop = this.editingShop();
    if (!shop) return;

    if (!this.editForm.subscriptionStartDate || !this.editForm.subscriptionExpiry) {
      this.toast('Both dates are required.', 'error'); return;
    }
    if (this.editForm.subscriptionStartDate >= this.editForm.subscriptionExpiry) {
      this.toast('Expiry must be after start date.', 'error'); return;
    }

    this.isSaving.set(true);
    const req: UpdateSubscriptionRequest = {
      subscriptionPlan:      this.editForm.subscriptionPlan,
      subscriptionStartDate: this.editForm.subscriptionStartDate,
      subscriptionExpiry:    this.editForm.subscriptionExpiry,
    };

    this.svc.updateSubscription(shop.businessAccountId, req).subscribe({
      next: (updated: ShopDetailDto) => {
        // ── Derive subscriptionStatus client-side from daysLeft ──────────
        // The API returns ShopDetailDto which has subscriptionStatus as a
        // C# computed property. We must recalculate it here so the badge
        // updates immediately without a full reload.
        const patchedList = this._toListItem(updated);

        // 1. Patch the card in the shop list
        this.shops.update(list =>
          list.map(s => s.businessAccountId === updated.businessAccountId
            ? patchedList : s)
        );

        // 2. Update drawer if it is open for this shop
        if (this.drawerShop()?.businessAccountId === updated.businessAccountId) {
          this.drawerShop.set(updated);
        }

        this.toast(`${updated.businessName} subscription updated.`, 'success');
        this.closeEdit();
        this.isSaving.set(false);
      },
      error: (e: Error) => { this.toast(e.message, 'error'); this.isSaving.set(false); },
    });
  }

  // ── Toggle active/inactive ────────────────────────────────────────────────
  toggleStatus(shop: ShopListItemDto | ShopDetailDto, e: Event): void {
    e.stopPropagation();

    this.svc.toggleStatus(shop.businessAccountId).subscribe({
      next: (updated: ShopDetailDto) => {
        const patchedList = this._toListItem(updated);

        // 1. Patch the card in the shop list immediately
        this.shops.update(list =>
          list.map(s => s.businessAccountId === updated.businessAccountId
            ? patchedList : s)
        );

        // 2. If drawer is open for this shop, refresh it too
        if (this.drawerShop()?.businessAccountId === updated.businessAccountId) {
          this.drawerShop.set(updated);
        }

        this.toast(
          `${updated.businessName} ${updated.isActive ? 'activated' : 'deactivated'}.`,
          'success'
        );
      },
      error: (e: Error) => this.toast(e.message, 'error'),
    });
  }

  // ── Private: compute subscriptionStatus client-side ───────────────────────
  // The API returns ShopDetailDto. We normalise it into ShopListItemDto here
  // so badges and labels are always based on fresh server data without a full
  // reload. subscriptionStatus is derived from daysLeft (same logic as C# DTO).
  private _toListItem(dto: ShopDetailDto | ShopListItemDto): ShopListItemDto {
    const status = this._calcStatus(dto.daysLeft, dto.isActive);
    return {
      businessAccountId:    dto.businessAccountId,
      businessName:         dto.businessName,
      ownerName:            dto.ownerName,
      businessPhone:        dto.businessPhone,
      businessEmail:        dto.businessEmail,
      isActive:             dto.isActive,
      createdAt:            dto.createdAt,
      shopType:             dto.shopType,
      subscriptionPlan:     dto.subscriptionPlan,
      subscriptionStartDate: dto.subscriptionStartDate,
      subscriptionExpiry:   dto.subscriptionExpiry,
      daysLeft:             dto.daysLeft,
      userCount:            dto.userCount,
      subscriptionStatus:   status,
    };
  }

  // Mirror the C# computed property: DaysLeft < 0 → Expired, ≤30 → Expiring, else Active
  private _calcStatus(daysLeft: number, isActive: boolean): SubscriptionStatus {
    if (!isActive)      return 'Active';   // isActive=false shown via badge-inactive
    if (daysLeft < 0)   return 'Expired';
    if (daysLeft <= 30) return 'Expiring';
    return 'Active';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3500);
  }

  statusClass(s: ShopListItemDto | ShopDetailDto): string {
    if (!s.isActive)                           return 'badge-inactive';
    if (s.subscriptionStatus === 'Expired')    return 'badge-expired';
    if (s.subscriptionStatus === 'Expiring')   return 'badge-expiring';
    return 'badge-active';
  }

  statusLabel(s: ShopListItemDto | ShopDetailDto): string {
    if (!s.isActive)                           return 'Inactive';
    if (s.subscriptionStatus === 'Expired')    return 'Expired';
    if (s.subscriptionStatus === 'Expiring')   return `${s.daysLeft}d left`;
    return 'Active';
  }

  planClass(plan: string): string {
    return plan === 'Pro' ? 'plan-pro' : plan === 'Basic' ? 'plan-basic' : 'plan-free';
  }

  toDateInput(val: string | null | undefined): string {
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  fmtDate(val: string | null | undefined): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarColor(id: number): string {
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444'][id % 7];
  }

  _calcDays(start: string, end: string): number {
    if (!start || !end) return 0;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(0, Math.ceil(diff / 86_400_000));
  }
}