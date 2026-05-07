/**
 * DashboardComponent — UPDATED (lightweight dashboard summary)
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes:
 *   1. getOrdersAll() removed — no longer fetches 9999 order rows.
 *   2. getOrdersDashboardSummary() added — fetches only:
 *        • daily totals (30 days) for trend chart & month summary
 *        • top 5 recent orders for Recent Orders card
 *   3. getCustomerSummary() — fetches KPI summary + top 5 due customers.
 *   4. orderDashboardSummary signal drives salesTrend, monthSummary,
 *      recentOrders, todayOrders, todayPaidCount, todayPendingCount.
 *   5. allOrders() signal no longer used in Dashboard.
 *   6. loadAll() waits for 3 calls (orders summary, customer summary, products).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SharedStateService } from '../services/shared-state.service';
import { CustomerSummary, OrderDashboardSummary } from '../services/shared-state.interfaces';

const CHART_H = 140;

@Component({
  selector:    'app-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls:   ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {

  isLoading = signal(true);
  CHART_H   = CHART_H;

  currentUser = computed(() => this.auth.currentUser());
  isAdmin     = computed(() => this.auth.isAdmin());

  // ── Products (still needed for low stock) ────────────────────
  allProducts   = computed(() => this.shared.products());
  lowStockItems = computed(() => this.shared.lowStockItems());
  lowStockCount = computed(() => this.shared.lowStockCount());

  // ── Order dashboard summary signal ────────────────────────────
  orderDashboardSummary = signal<OrderDashboardSummary | null>(null);

  // ── Customer KPI summary signal ───────────────────────────────
  customerSummary = signal<CustomerSummary | null>(null);

  // ── Today KPIs — DB-authoritative ────────────────────────────
  todaySummary = computed(() => this.shared.todaySummary());

  // ── Today's local date string (YYYY-MM-DD) ───────────────────
  todayStr = computed(() => this.localDateStr(new Date()));

  // ── Month summary — derived from daily totals ─────────────────
  // monthSummary = computed(() => {
  //   const now        = new Date();
  //   const monthStart = this.localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  //   const daily      = this.orderDashboardSummary()?.dailyTotals ?? [];
  //   const monthSales = daily
  //     .filter(t => t.date >= monthStart)
  //     .reduce((s, t) => s + t.total, 0);
  //   const orderCount = daily
  //     .filter(t => t.date >= monthStart)
  //     .length; // row per day — approximate; todaySummary has exact today count
  //   return { monthSales, orderCount };
  // });

  monthSummary = computed(() => {
    const now        = new Date();
    const monthStart = this.localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    const orders     = this.orderDashboardSummary()?.dailyTotals ?? [];

    const monthOrders = orders.filter(o => o.date.slice(0, 10) >= monthStart);
    return {
      monthSales: monthOrders.reduce((s, o) => s + o.total, 0),
      orderCount: monthOrders.length,  // ← now accurate, one row per order
    };
  });

  // ── Customer KPIs ─────────────────────────────────────────────
  totalCustomers        = computed(() => this.customerSummary()?.totalCount       ?? 0);
  creditPending         = computed(() => this.customerSummary()?.totalDueAmount   ?? 0);
  totalDue              = computed(() => this.customerSummary()?.totalDueAmount   ?? 0);
  customersWithDueCount = computed(() => this.customerSummary()?.customersWithDue ?? 0);
  topDueCustomers       = computed(() => this.customerSummary()?.topDueCustomers  ?? []);

  // ── Recent Orders — top 5 from summary ───────────────────────
  recentOrders = computed(() => this.orderDashboardSummary()?.recentOrders ?? []);

  // ── 15-day sales trend — built from daily totals ──────────────
  // salesTrend = computed(() => {
  //   const daily = this.orderDashboardSummary()?.dailyTotals ?? [];
  //   const trend: { date: string; amount: number; isReal: boolean }[] = [];

  //   for (let i = 14; i >= 0; i--) {
  //     const d = new Date();
  //     d.setDate(d.getDate() - i);
  //     d.setHours(0, 0, 0, 0);
  //     const dateStr = this.localDateStr(d);
  //     const found   = daily.find(t => t.date === dateStr);
  //     trend.push({
  //       date:   dateStr,
  //       amount: found?.total ?? 0,
  //       isReal: !!found && found.total > 0,
  //     });
  //   }
  //   return trend;
  // });

  salesTrend = computed(() => {
    const orders = this.orderDashboardSummary()?.dailyTotals ?? [];
    const trend: { date: string; amount: number; isReal: boolean }[] = [];

    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = this.localDateStr(d);

      const dayOrders = orders.filter(o => o.date.slice(0, 10) === dateStr);
      const amount    = dayOrders.reduce((s, o) => s + o.total, 0);

      trend.push({ date: dateStr, amount, isReal: amount > 0 });
    }
    return trend;
  });

  maxTrend = computed(() =>
    Math.max(...this.salesTrend().map(t => t.amount), 1)
  );

  // ── Worker dashboard — today's orders from recent list ────────
  todayOrders = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (this.orderDashboardSummary()?.recentOrders ?? [])
      .filter(o => new Date(o.createdAt) >= today)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  todayPaidCount    = computed(() => this.todayOrders().filter(o => o.status === 'Paid').length);
  todayPendingCount = computed(() => this.todayOrders().filter(o => o.status !== 'Paid').length);

  constructor(private auth: AuthService, private shared: SharedStateService) {}

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) console.error('[Dashboard] load error:', err);
      if (++done === 3) this.isLoading.set(false);
    };

    // ✅ Lightweight — daily totals + top 5 recent orders only
    this.shared.getOrdersDashboardSummary(this.daysAgoStr(30)).subscribe({
      next:  summary => { this.orderDashboardSummary.set(summary); fin(); },
      error: e       => fin(e),
    });

    // ✅ Lightweight — 1 summary row + top 5 due customers only
    this.shared.getCustomerSummary().subscribe({
      next:  summary => { this.customerSummary.set(summary); fin(); },
      error: e       => fin(e),
    });

    this.shared.getProducts().subscribe({
      next:  () => fin(),
      error: e  => fin(e),
    });

    // Fire-and-forget — does not block loading gate
    this.shared.getTodaySummary().subscribe({
      error: e => console.error('[Dashboard] todaySummary error:', e),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Returns YYYY-MM-DD from LOCAL date parts.
   * Never use toISOString() — it returns UTC and shows the wrong date
   * in IST (UTC+5:30) and other UTC+ timezones.
   */
  localDateStr(d: Date): string {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private daysAgoStr(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return this.localDateStr(d);
  }

  barH(amount: number): number {
    if (amount === 0) return 2;
    return Math.max(3, Math.round((amount / this.maxTrend()) * CHART_H));
  }

  itemSummary(order: any): string {
    if (order.items && Array.isArray(order.items)) {
      return order.items
        .map((i: any) =>
          `${i.quantity}× ${i.productName
            .replace(' Water Can', '')
            .replace(' Water Bottle', '')}`
        )
        .join(', ');
    }
    // recentOrders from dashboard summary carry itemsJson string
    try {
      const items = JSON.parse(order.itemsJson ?? '[]');
      return items
        .map((i: any) =>
          `${i.quantity}× ${i.productName
            .replace(' Water Can', '')
            .replace(' Water Bottle', '')}`
        )
        .join(', ');
    } catch {
      return '';
    }
  }

  fmtMoney(n: number): string {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(n);
  }

  fmtDate(s: string): string {
    return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  timeAgo(d: Date | string | null): string {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  getFirstName(): string {
    return (this.currentUser()?.name || '').split(' ')[0] || 'there';
  }

  stockPercent(currentStock: number, minStockAlert: number): number {
    const max = Math.max(currentStock + 20, minStockAlert * 3);
    return Math.min(100, Math.round((currentStock / max) * 100));
  }

  statusClass(status: string): string {
    return ({ Paid: 'st-paid', Credit: 'st-credit', Partial: 'st-partial' } as any)[status] || '';
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  now(): Date { return new Date(); }

  trackByDate(_: number, item: { date: string }): string   { return item.date; }
  trackById(_: number, item: { id: number }): number       { return item.id; }
  trackByOrderId(_: number, order: { id: number }): number { return order.id; }
}