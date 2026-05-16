// src/app/shell/shell.component.ts
import { Component, signal, computed, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService }          from '../services/auth.service';
import { SharedStateService, UserRole } from '../services/shared-state.service';

interface NavItem {
  path:       string;
  label:      string;
  icon:       string;
  module:     string;
  adminOnly?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const ALL_NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'bi-speedometer2',   module: 'Dashboard' },
      { path: '/billing',   label: 'Billing',   icon: 'bi-receipt-cutoff', module: 'Billing'   },
      { path: '/customers', label: 'Customers', icon: 'bi-people-fill',    module: 'Customers' },
      { path: '/products',  label: 'Products',  icon: 'bi-box-seam',       module: 'Products'  },
      { path: '/inventory', label: 'Inventory', icon: 'bi-boxes',          module: 'Inventory' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { path: '/purchases', label: 'Purchases', icon: 'bi-cart3',   module: 'Purchases' },
      { path: '/expenses',  label: 'Expenses',  icon: 'bi-wallet2', module: 'Expenses'  },
      { path: '/suppliers', label: 'Suppliers', icon: 'bi-truck',   module: 'Suppliers' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { path: '/reports',  label: 'Reports',  icon: 'bi-bar-chart-line', module: 'Reports'  },
      { path: '/users',    label: 'Users',    icon: 'bi-people',         module: 'Users'    },
      { path: '/settings', label: 'Settings', icon: 'bi-gear',           module: 'Settings' },
    ],
  },
  {
    label: 'Personal',
    items: [
      { path: '/account', label: 'Account', icon: 'bi-person-circle', module: 'Account' },
    ],
  },
];

const SA_NAV_SECTIONS: NavSection[] = [
  {
    label: 'Super Admin',
    items: [
      { path: '/superadmin/dashboard', label: 'SA Dashboard', icon: 'bi-shield-fill-check', module: 'SADashboard' },
      { path: '/superadmin/shops',     label: 'Manage Shops', icon: 'bi-grid-fill',         module: 'SAShops'    },
      { path: '/superadmin/billing',   label: 'Billing',      icon: 'bi-currency-dollar',   module: 'SABilling'  },
    ],
  },
  {
    label: 'Personal',
    items: [
      { path: '/account', label: 'Account', icon: 'bi-person-circle', module: 'Account' },
    ],
  },
];

@Component({
  selector:    'app-shell',
  standalone:  true,
  imports:     [CommonModule, RouterModule, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrls:   ['./shell.component.css'],
})
export class ShellComponent implements OnInit {

  activeRoute  = signal('');
  sidebarOpen  = signal(true);
  mobileOpen   = signal(false);
  userMenuOpen = signal(false);
  notifOpen    = signal(false);
  currentYear  = new Date().getFullYear();

  isLoadingSettings = signal(true);

  // ── Live signals from SharedStateService ──────────────────────────────────
  lowStockAlert = computed(() => this.shared.lowStockCount());
  duePending    = computed(() => this.shared.totalCreditPending() > 0 ? 1 : 0);
  businessName  = computed(() => this.shared.businessName());
  ownerName     = computed(() => this.shared.ownerName());
  themeColor    = computed(() => this.shared.themeColor());

  // ── Live notification data (real, from SharedStateService) ────────────────
  totalCreditPending = computed(() => this.shared.totalCreditPending());
  lowStockCount      = computed(() => this.shared.lowStockCount());

  // ── Auth ──────────────────────────────────────────────────────────────────
  currentUser  = computed(() => this.auth.currentUser());
  isAdmin      = computed(() => this.auth.isAdmin());
  isSuperAdmin = computed(() => this.auth.isSuperAdmin());

  // ── Total notification badge count ────────────────────────────────────────
  // Sum of: low stock alert + 1 if there are any credit pending customers
  notifBadgeCount = computed(() => {
    const stock = this.lowStockCount() > 0 ? 1 : 0;
    const dues  = this.totalCreditPending() > 0 ? 1 : 0;
    return stock + dues;
  });

  // ── Nav sections ──────────────────────────────────────────────────────────
  navSections = computed<NavSection[]>(() => {
    if (this.isSuperAdmin()) return SA_NAV_SECTIONS;

    const role    = (this.currentUser()?.role ?? 'Worker') as UserRole;
    const visible = this.shared.visibleModulesSignal(role)();

    return ALL_NAV_SECTIONS
      .map(section => ({
        ...section,
        items: section.items.filter(item => visible.includes(item.module)),
      }))
      .filter(section => section.items.length > 0);
  });

  constructor(
    private auth:   AuthService,
    private router: Router,
    public  shared: SharedStateService,
  ) {
    // Track active route and close mobile drawer on every navigation
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ).subscribe((e: any) => {
      this.activeRoute.set(e.urlAfterRedirects);
      this.mobileOpen.set(false);
    });
  }

  ngOnInit(): void {
    this._loadSettingsAndPermissions();

    // Load notification data immediately on shell init so the bell badge
    // shows correct values regardless of which page the user lands on.
    // SuperAdmin has no customers/inventory so skip for them.
    if (!this.isSuperAdmin()) {
      this._loadNotificationData();
    }

    // Re-fetch notification data on every navigation so it stays live
    // without requiring a full page refresh.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ).subscribe(() => {
      if (!this.isSuperAdmin()) {
        this._loadNotificationData();
      }
    });
  }

  /**
   * Fetches the two signals that drive the notification bell:
   *   • shared.totalCreditPending()  — from getCustomerSummary()
   *   • shared.lowStockCount()       — from getProducts()
   *
   * Both are fire-and-forget; SharedStateService updates its internal
   * signals and Angular's computed() picks up the change automatically.
   */
  // private _loadNotificationData(): void {
  //   // Credit pending — lightweight summary row (1 DB row, fast)
  //   this.shared.getCustomerSummary().subscribe({
  //     error: e => console.warn('[Shell] getCustomerSummary error:', e),
  //   });

  //   // Low stock — product list (already cached by SharedStateService)
  //   this.shared.getProducts().subscribe({
  //     error: e => console.warn('[Shell] getProducts error:', e),
  //   });
  // }

  // private _loadNotificationData(): void {
  //   // Use the summary endpoint — returns aggregate across ALL customers,
  //   // not just the current page. Apply totalDueAmount to the core signal.
  //   this.shared.getCustomerSummary().subscribe({
  //     next: summary => {
  //       // Directly patch the core totalCreditPending via a synthetic customer
  //       // list entry, OR expose a dedicated setter. Best: expose a setter.
  //       this.shared.applyCustomerSummary(summary);
  //     },
  //     error: e => console.warn('[Shell] getCustomerSummary error:', e),
  //   });

  //   // Use the product summary endpoint — returns lowStockCount across ALL products.
  //   this.shared.getProductSummary().subscribe({
  //     next: summary => {
  //       this.shared.applyProductSummary(summary);
  //     },
  //     error: e => console.warn('[Shell] getProductSummary error:', e),
  //   });
  // }

  private _loadNotificationData(): void {
    // Fetches aggregate totals across ALL rows — not just the current page.
    this.shared.getCustomerSummary().subscribe({
      next:  s => this.shared.applyCustomerSummary(s),
      error: e => console.warn('[Shell] getCustomerSummary error:', e),
    });

    this.shared.getProductSummary().subscribe({
      next:  s => this.shared.applyProductSummary(s),
      error: e => console.warn('[Shell] getProductSummary error:', e),
    });
  }

  private _loadSettingsAndPermissions(): void {
    if (this.isSuperAdmin()) {
      this.isLoadingSettings.set(false);
      return;
    }

    const role = this.currentUser()?.role ?? 'Worker';

    if (role === 'Admin') {
      this.shared.getSettings().subscribe({
        next:  settings => {
          this.shared.applyThemeToDom(settings.themeColor);
          this.isLoadingSettings.set(false);
        },
        error: () => {
          this.shared.applyThemeToDom(this.shared.themeColor());
          this.isLoadingSettings.set(false);
        },
      });
    } else {
      this.shared.loadMyRolePermissions().subscribe({
        next:  () => {
          this.shared.applyThemeToDom(this.shared.themeColor());
          this.isLoadingSettings.set(false);
        },
        error: () => {
          this.shared.applyThemeToDom(this.shared.themeColor());
          this.isLoadingSettings.set(false);
        },
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  isActive(path: string): boolean { return this.activeRoute().startsWith(path); }

  /**
   * Returns inline style object for an active nav item.
   * Uses the live themeColor() signal so the highlight tracks
   * whatever colour the user picked in Settings → Appearance.
   */
  activeNavStyle(path: string): Record<string, string> {
    if (!this.isActive(path)) return {};
    const color = this.themeColor() || '#0057FF';
    return { background: color };
  }

  /**
   * Active nav icon colour — white on coloured background.
   */
  activeIconStyle(path: string): Record<string, string> {
    return this.isActive(path) ? { color: '#fff' } : {};
  }

  toggleSidebar()  { this.sidebarOpen.update(v => !v); }
  toggleMobile()   { this.mobileOpen.update(v => !v); }
  closeMobile()    { this.mobileOpen.set(false); }
  toggleUserMenu() { this.userMenuOpen.update(v => !v); this.notifOpen.set(false); }
  toggleNotif()    { this.notifOpen.update(v => !v);    this.userMenuOpen.set(false); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.user-menu-wrap') && !t.closest('.notif-wrap')) {
      this.userMenuOpen.set(false);
      this.notifOpen.set(false);
    }
  }

  logout(): void { this.auth.logout(); }

  getPageTitle(): string {
    const r = this.activeRoute();
    if (r.includes('superadmin/dashboard')) return 'SA Dashboard';
    if (r.includes('superadmin/shops'))     return 'Manage Shops';
    if (r.includes('superadmin/billing'))   return 'Billing';
    if (r.includes('dashboard'))  return 'Dashboard';
    if (r.includes('billing'))    return 'Billing';
    if (r.includes('customers'))  return 'Customers';
    if (r.includes('products'))   return 'Products';
    if (r.includes('inventory'))  return 'Inventory';
    if (r.includes('purchases'))  return 'Purchases';
    if (r.includes('expenses'))   return 'Expenses';
    if (r.includes('suppliers'))  return 'Suppliers';
    if (r.includes('reports'))    return 'Reports';
    if (r.includes('users'))      return 'Users & Roles';
    if (r.includes('settings'))   return 'Settings';
    if (r.includes('account'))    return 'Account';
    return 'AquaERP';
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarBg(): string { return this.themeColor() || '#0057FF'; }

  /** Format money for notification panel */
  fmtMoney(n: number): string {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)   return '₹' + (n / 1000).toFixed(1)   + 'K';
    return '₹' + Math.round(n);
  }
}