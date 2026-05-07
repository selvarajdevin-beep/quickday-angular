/**
 * ReportsComponent — FIELD NAME FIX (Apr 2026)
 *
 * Fixes vs previous version:
 *  1. CustomerReportRow.totalAmount → totalSales  (C# sends TotalSales)
 *  2. CustomerReportRow.lastOrderDate — now Date | null, formatted safely
 *  3. PurchaseReportRow.totalOrders  → totalPurchases (C# sends TotalPurchases)
 *  4. PurchaseReportRow.creditPending → totalDue  (C# sends TotalDue)
 *  5. fmtDate() now handles ISO datetime strings safely (no "Invalid Date")
 *  6. sortCol default changed from 'totalAmount' to 'totalSales' to match backend
 *  7. Export rewritten to use XLSX library (same as CustomerHistoryModal)
 *     - Proper .xlsx files with correct column widths
 *     - Numeric columns stored as numbers (not strings) so Excel can sum them
 *     - A "Summary" sheet on every export with date range + KPI totals
 *     - Human-readable column headers (no underscores)
 *     - CSV export still available and also improved
 */
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SharedStateService, DateRange, Order, Expense, Purchase, CustomerReportRow, PurchaseReportRow } from '../../services/shared-state.service';

declare const XLSX: any;

export type ReportType = 'daily-sales' | 'monthly-sales' | 'customer' | 'expense' | 'profit' | 'purchase';

const EXPENSE_COLORS: Record<string, string> = {
  'Salary':              '#8B5CF6',
  'Petrol':              '#0057FF',
  'Vehicle Maintenance': '#F59E0B',
  'Rent':                '#06B6D4',
  'Electricity':         '#EF4444',
  'Misc':                '#9CA3AF',
};

const CHART_H = 160;

@Component({
  selector:    'app-reports',
  standalone:  true,
  imports:     [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './reports.component.html',
  styleUrls:   ['./reports.component.css'],
})
export class ReportsComponent implements OnInit {

  activeReport = signal<ReportType>('daily-sales');
  isLoading    = signal(true);

  dateFrom   = signal(this.daysAgo(30));
  dateTo     = signal(this.today());
  quickRange = signal<'7d' | '30d' | '90d' | 'custom'>('30d');

  CHART_H       = CHART_H;
  expenseColors = EXPENSE_COLORS;

  private allOrders   = signal<Order[]>([]);
  private allExpenses = signal<Expense[]>([]);

  private creditPendingKpi = signal(0);
  private totalOrdersKpi   = signal(0);

  reports: { type: ReportType; label: string; icon: string }[] = [
    { type: 'daily-sales',   label: 'Daily Sales',   icon: 'bi-graph-up-arrow' },
    { type: 'monthly-sales', label: 'Monthly Sales', icon: 'bi-bar-chart-fill' },
    { type: 'customer',      label: 'Customer-wise', icon: 'bi-people-fill'    },
    { type: 'expense',       label: 'Expenses',      icon: 'bi-wallet2'        },
    { type: 'profit',        label: 'Profit',        icon: 'bi-bar-chart-line' },
    { type: 'purchase',      label: 'Purchases',     icon: 'bi-cart3'          },
  ];

  constructor(private svc: SharedStateService) {}

  ngOnInit(): void {
    this.custSearchSubject.pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => { this.custPage.set(1); this.loadCustomerReport(); });

    this.purSearchSubject.pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => { this.purPage.set(1); this.loadPurchaseReport(); });

    this.loadAll();
  }

  loadAll(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) console.error('[Reports] load error:', err);
      if (++done === 3) this.isLoading.set(false);
    };

    this.svc.getOrdersAll(this.dateFrom(), this.dateTo()).subscribe({
      next: orders => { this.allOrders.set(orders); fin(); },
      error: e => fin(e),
    });

    this.svc.getExpenses({
      from: this.dateFrom(), to: this.dateTo(),
      page: 1, pageSize: 9999,
    }).subscribe({
      next: paged => { this.allExpenses.set(paged.items); fin(); },
      error: e => fin(e),
    });

    this.svc.getCustomerSummary().subscribe({
      next: s => { this.creditPendingKpi.set(s.totalDueAmount ?? 0); fin(); },
      error: e => fin(e),
    });

    this.loadCustomerReport();
    this.loadPurchaseReport();
  }

  private reloadForRange(): void {
    this.custPage.set(1);
    this.purPage.set(1);
    this.dailyPage.set(1);
    this.monthlyPage.set(1);

    this.svc.getOrdersAll(this.dateFrom(), this.dateTo()).subscribe({
      next: orders => this.allOrders.set(orders),
      error: () => console.error('[Reports] reload orders failed'),
    });

    this.svc.getExpenses({
      from: this.dateFrom(), to: this.dateTo(),
      page: 1, pageSize: 9999,
    }).subscribe({
      next: paged => this.allExpenses.set(paged.items),
      error: () => console.error('[Reports] reload expenses failed'),
    });

    this.loadCustomerReport();
    this.loadPurchaseReport();
  }

  range(): DateRange { return { from: this.dateFrom(), to: this.dateTo() }; }

  setQuickRange(q: '7d' | '30d' | '90d'): void {
    const days = q === '7d' ? 7 : q === '30d' ? 30 : 90;
    this.quickRange.set(q);
    this.dateFrom.set(this.daysAgo(days));
    this.dateTo.set(this.today());
    this.reloadForRange();
  }

  onDateFromChange(val: string): void { this.dateFrom.set(val); this.quickRange.set('custom'); }
  onDateToChange(val: string): void   { this.dateTo.set(val);   this.quickRange.set('custom'); }
  applyCustomRange(): void            { this.quickRange.set('custom'); this.reloadForRange(); }

  switchReport(type: ReportType): void { this.activeReport.set(type); }

  // ── trackBy ───────────────────────────────────────────────────
  trackByDate(_: number, row: { date: string }): string             { return row.date; }
  trackByMonth(_: number, row: { month: string }): string           { return row.month; }
  trackByCustomer(_: number, row: CustomerReportRow): number        { return row.customerId; }
  trackBySupplier(_: number, row: PurchaseReportRow): number        { return row.supplierId; }
  trackByExpenseType(_: number, row: { type: string }): string      { return row.type; }
  trackByNumber(_: number, n: number): number                       { return n; }

  private inRange(date: Date | string): boolean {
    const t = new Date(date).getTime();
    const from = new Date(this.dateFrom()); from.setHours(0, 0, 0, 0);
    const to   = new Date(this.dateTo());   to.setHours(23, 59, 59, 999);
    return t >= from.getTime() && t <= to.getTime();
  }

  private ordersInRange = computed(() =>
    this.allOrders().filter(o => this.inRange(o.createdAt))
  );

  private expensesInRange = computed(() =>
    this.allExpenses().filter(e => this.inRange(e.date))
  );

  summary = computed(() => {
    const orders   = this.ordersInRange();
    const expenses = this.expensesInRange();
    const totalSales    = orders.reduce((s, o) => s + o.grandTotal, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const totalPurchases = this.purReportAmount();
    return {
      totalSales, totalExpenses, totalPurchases,
      netProfit:    totalSales - totalExpenses - totalPurchases,
      totalOrders:  orders.length,
      creditPending: this.creditPendingKpi(),
    };
  });

  // ── Daily sales ───────────────────────────────────────────────
  dailySalesRows = computed(() => {
    const map = new Map<string, { cash: number; upi: number; credit: number; count: number }>();
    for (const o of this.allOrders()) {
      const ds = this.localDateStr(new Date(o.createdAt));
      const ex = map.get(ds) ?? { cash: 0, upi: 0, credit: 0, count: 0 };
      if (o.paymentType === 'Cash')     ex.cash   += o.paidAmount;
      else if (o.paymentType === 'UPI') ex.upi    += o.paidAmount;
      else                              ex.credit += o.grandTotal;
      ex.count++;
      map.set(ds, ex);
    }
    const from = new Date(this.dateFrom()); from.setHours(0, 0, 0, 0);
    const to   = new Date(this.dateTo());   to.setHours(23, 59, 59, 999);
    const rows = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      const ds   = this.localDateStr(cursor);
      const real = map.get(ds);
      rows.push({
        date:         ds,
        orderCount:   real?.count  ?? 0,
        cashAmount:   real?.cash   ?? 0,
        upiAmount:    real?.upi    ?? 0,
        creditAmount: real?.credit ?? 0,
        totalSales:   real ? real.cash + real.upi + real.credit : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  });

  chartDailyRows = computed(() => this.dailySalesRows().slice(-60));

  dailyPage = signal(1);
  readonly DAILY_PAGE_SIZE = 20;

  dailyTotalPages = computed(() => Math.max(1, Math.ceil(this.dailySalesRows().length / this.DAILY_PAGE_SIZE)));
  pagedDailyRows  = computed(() => {
    const reversed = this.dailySalesRows().slice().reverse();
    const start = (this.dailyPage() - 1) * this.DAILY_PAGE_SIZE;
    return reversed.slice(start, start + this.DAILY_PAGE_SIZE);
  });
  dailyPageNums  = computed(() => this._pageNums(this.dailyPage(), this.dailyTotalPages()));
  dailyPageStart = computed(() => this.dailySalesRows().length === 0 ? 0 : (this.dailyPage() - 1) * this.DAILY_PAGE_SIZE + 1);
  dailyPageEnd   = computed(() => Math.min(this.dailyPage() * this.DAILY_PAGE_SIZE, this.dailySalesRows().length));
  goDailyPage(p: number): void { this.dailyPage.set(Math.max(1, Math.min(p, this.dailyTotalPages()))); }

  maxSales = computed(() => Math.max(...this.chartDailyRows().map(r => r.totalSales), 1));

  barPx(val: number, max: number): number {
    if (!val || val <= 0 || max <= 0) return 0;
    return Math.max(3, Math.round((val / max) * CHART_H));
  }

  // ── Monthly / Profit ──────────────────────────────────────────
  monthlySalesRows = computed(() => {
    const from = new Date(this.dateFrom()); from.setHours(0, 0, 0, 0);
    const to   = new Date(this.dateTo());   to.setHours(23, 59, 59, 999);

    const months = new Map<string, { income: number; expenses: number; purchases: number }>();
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;
      if (!months.has(key)) months.set(key, { income: 0, expenses: 0, purchases: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    for (const o of this.allOrders()) {
      const d   = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (months.has(key)) months.get(key)!.income += o.grandTotal;
    }
    for (const e of this.allExpenses()) {
      const d   = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (months.has(key)) months.get(key)!.expenses += e.amount;
    }
    return Array.from(months.entries()).map(([key, v]) => {
      const [y, m] = key.split('-').map(Number);
      const label  = new Date(y, m-1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      return { month: label, key, income: v.income, expenses: v.expenses, purchases: v.purchases,
               profit: v.income - v.expenses - v.purchases };
    });
  });

  monthlyPage = signal(1);
  readonly MONTHLY_PAGE_SIZE = 12;
  monthlyTotalPages = computed(() => Math.max(1, Math.ceil(this.monthlySalesRows().length / this.MONTHLY_PAGE_SIZE)));
  pagedMonthlyRows  = computed(() => {
    const start = (this.monthlyPage() - 1) * this.MONTHLY_PAGE_SIZE;
    return this.monthlySalesRows().slice(start, start + this.MONTHLY_PAGE_SIZE);
  });
  monthlyPageNums = computed(() => this._pageNums(this.monthlyPage(), this.monthlyTotalPages()));
  goMonthlyPage(p: number): void { this.monthlyPage.set(Math.max(1, Math.min(p, this.monthlyTotalPages()))); }

  maxMonthlySales = computed(() => Math.max(...this.monthlySalesRows().map(r => r.income), 1));
  profitRows      = computed(() => this.monthlySalesRows());
  maxProfit       = computed(() => Math.max(
    ...this.profitRows().map(r => r.income),
    ...this.profitRows().map(r => r.expenses + r.purchases), 1));

  // ── Expense rows ──────────────────────────────────────────────
  expenseRows = computed(() => {
    const expenses = this.expensesInRange();
    const TYPES = ['Salary', 'Petrol', 'Vehicle Maintenance', 'Rent', 'Electricity', 'Misc'] as const;
    return TYPES
      .map(type => ({
        type,
        amount: expenses.filter(e => e.type === type).reduce((s, e) => s + e.amount, 0),
        count:  expenses.filter(e => e.type === type).length,
      }))
      .filter(r => r.amount > 0);
  });

  totalExpenseAmount  = computed(() => this.expenseRows().reduce((s, r) => s + r.amount, 0));
  totalExpenseEntries = computed(() => this.expenseRows().reduce((s, r) => s + r.count, 0));

  expensePct(amount: number): number {
    const t = this.totalExpenseAmount();
    return t ? Math.round((amount / t) * 100) : 0;
  }

  getDonutOffset(index: number): number {
    const circ = 251.3;
    const rows = this.expenseRows();
    let cumPct = 0;
    for (let i = 0; i < index; i++) cumPct += this.expensePct(rows[i].amount);
    return -(cumPct * circ / 100);
  }

  // ══════════════════════════════════════════════════════════════
  // CUSTOMER REPORT — server-paginated
  // ══════════════════════════════════════════════════════════════

  custReportRows  = signal<CustomerReportRow[]>([]);
  custReportTotal = signal(0);
  custPage        = signal(1);
  custIsLoading   = signal(false);
  readonly CUST_PAGE_SIZE = 10;

  customerFilter = signal('');
  sortCol        = signal('totalSales');
  sortDir        = signal<'asc' | 'desc'>('desc');

  private custSearchSubject = new Subject<string>();

  custTotalPages = computed(() => Math.max(1, Math.ceil(this.custReportTotal() / this.CUST_PAGE_SIZE)));
  custPageNums   = computed(() => this._pageNums(this.custPage(), this.custTotalPages()));
  custPageStart  = computed(() => this.custReportTotal() === 0 ? 0 : (this.custPage() - 1) * this.CUST_PAGE_SIZE + 1);
  custPageEnd    = computed(() => Math.min(this.custPage() * this.CUST_PAGE_SIZE, this.custReportTotal()));

  loadCustomerReport(callback?: (err?: unknown) => void): void {
    this.custIsLoading.set(true);
    this.svc.getCustomerReport({
      from: this.dateFrom(), to: this.dateTo(),
      search:  this.customerFilter().trim() || undefined,
      sortBy:  this.sortCol(), sortDir: this.sortDir(),
      page: this.custPage(), pageSize: this.CUST_PAGE_SIZE,
    }).subscribe({
      next: paged => {
        this.custReportRows.set(paged.items);
        this.custReportTotal.set(paged.totalCount);
        this.custIsLoading.set(false);
        callback?.();
      },
      error: e => { console.error('[Reports] customer report failed:', e); this.custIsLoading.set(false); callback?.(e); },
    });
  }

  onCustSearch(val: string): void { this.customerFilter.set(val); this.custSearchSubject.next(val); }

  sortBy(col: string): void {
    if (this.sortCol() === col) this.sortDir.update(d => d === 'desc' ? 'asc' : 'desc');
    else { this.sortCol.set(col); this.sortDir.set('desc'); }
    this.custPage.set(1);
    this.loadCustomerReport();
  }

  goCustPage(p: number): void {
    if (p >= 1 && p <= this.custTotalPages()) { this.custPage.set(p); this.loadCustomerReport(); }
  }

  // ══════════════════════════════════════════════════════════════
  // PURCHASE REPORT — server-paginated
  // ══════════════════════════════════════════════════════════════

  purReportRows   = signal<PurchaseReportRow[]>([]);
  purReportTotal  = signal(0);
  purReportAmount = signal(0);
  purPage         = signal(1);
  purIsLoading    = signal(false);
  readonly PUR_PAGE_SIZE = 10;

  supplierFilter = signal('');
  private purSearchSubject = new Subject<string>();

  purTotalPages = computed(() => Math.max(1, Math.ceil(this.purReportTotal() / this.PUR_PAGE_SIZE)));
  purPageNums   = computed(() => this._pageNums(this.purPage(), this.purTotalPages()));
  purPageStart  = computed(() => this.purReportTotal() === 0 ? 0 : (this.purPage() - 1) * this.PUR_PAGE_SIZE + 1);
  purPageEnd    = computed(() => Math.min(this.purPage() * this.PUR_PAGE_SIZE, this.purReportTotal()));

  loadPurchaseReport(callback?: (err?: unknown) => void): void {
    this.purIsLoading.set(true);
    this.svc.getPurchaseReport({
      from: this.dateFrom(), to: this.dateTo(),
      search: this.supplierFilter().trim() || undefined,
      page: this.purPage(), pageSize: this.PUR_PAGE_SIZE,
    }).subscribe({
      next: paged => {
        this.purReportRows.set(paged.items);
        this.purReportTotal.set(paged.totalCount);
        if (paged.globalSummary) this.purReportAmount.set(paged.globalSummary.totalAmount);
        this.purIsLoading.set(false);
        callback?.();
      },
      error: e => { console.error('[Reports] purchase report failed:', e); this.purIsLoading.set(false); callback?.(e); },
    });
  }

  onPurSearch(val: string): void { this.supplierFilter.set(val); this.purSearchSubject.next(val); }

  goPurPage(p: number): void {
    if (p >= 1 && p <= this.purTotalPages()) { this.purPage.set(p); this.loadPurchaseReport(); }
  }

  // ══════════════════════════════════════════════════════════════
  // EXPORT  — rewritten to use XLSX library (same as CustomerHistoryModal)
  // ══════════════════════════════════════════════════════════════

  /** CSV export — clean headers, UTF-8 BOM, proper quoting */
  exportCSV(): void {
    const { rows, headers } = this._getExportData();
    if (!rows.length) { alert('No data to export for this report'); return; }

    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(r =>
        headers.map(h => {
          const v = String((r as any)[h] ?? '');
          return `"${v.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ].join('\n');

    this._download(
      new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
      `${this._reportLabel()}_${this.dateFrom()}_to_${this.dateTo()}.csv`
    );
  }

  /** Excel export — proper .xlsx via SheetJS, with column widths + Summary sheet */
  exportExcel(): void {
    const { rows, headers, colWidths, sheetName } = this._getExportData();
    if (!rows.length) { alert('No data to export for this report'); return; }

    const wb = XLSX.utils.book_new();

    // ── Main data sheet ──────────────────────────────────────────
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // ── Summary sheet ────────────────────────────────────────────
    const s = this.summary();
    const summaryRows = [
      { Field: 'Report Type',       Value: this._reportLabel() },
      { Field: 'Date From',         Value: this.dateFrom() },
      { Field: 'Date To',           Value: this.dateTo() },
      { Field: '',                  Value: '' },
      { Field: 'Total Sales (₹)',   Value: s.totalSales },
      { Field: 'Total Orders',      Value: s.totalOrders },
      { Field: 'Net Profit (₹)',    Value: s.netProfit },
      { Field: 'Total Expenses (₹)',Value: s.totalExpenses },
      { Field: 'Total Purchases (₹)',Value: s.totalPurchases },
      { Field: 'Credit Pending (₹)',Value: s.creditPending },
      { Field: '',                  Value: '' },
      { Field: 'Exported At',       Value: new Date().toLocaleString('en-IN') },
    ];
    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2['!cols'] = [{ wch: 24 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    XLSX.writeFile(wb, `${this._reportLabel()}_${this.dateFrom()}_to_${this.dateTo()}.xlsx`);
  }

  // ── Build typed rows + metadata per report type ───────────────
  private _getExportData(): {
    rows:      Record<string, string | number>[];
    headers:   string[];
    colWidths: number[];
    sheetName: string;
  } {
    const t = this.activeReport();

    if (t === 'daily-sales') {
      const rows = this.dailySalesRows().slice().reverse().map(r => ({
        'Date':           r.date,
        'Orders':         r.orderCount,
        'Cash (₹)':       r.cashAmount,
        'UPI (₹)':        r.upiAmount,
        'Credit (₹)':     r.creditAmount,
        'Total Sales (₹)':r.totalSales,
      }));
      return {
        rows, sheetName: 'Daily Sales',
        headers:   ['Date', 'Orders', 'Cash (₹)', 'UPI (₹)', 'Credit (₹)', 'Total Sales (₹)'],
        colWidths: [14, 10, 14, 14, 14, 16],
      };
    }

    if (t === 'monthly-sales') {
      const rows = this.monthlySalesRows().map(r => ({
        'Month':          r.month,
        'Income (₹)':     r.income,
        'Expenses (₹)':   r.expenses,
        'Purchases (₹)':  r.purchases,
        'Net Profit (₹)': r.profit,
      }));
      return {
        rows, sheetName: 'Monthly Sales',
        headers:   ['Month', 'Income (₹)', 'Expenses (₹)', 'Purchases (₹)', 'Net Profit (₹)'],
        colWidths: [16, 16, 16, 16, 16],
      };
    }

    if (t === 'profit') {
      const rows = this.profitRows().map(r => ({
        'Month':           r.month,
        'Income (₹)':      r.income,
        'Expenses (₹)':    r.expenses,
        'Purchases (₹)':   r.purchases,
        'Net Profit (₹)':  r.profit,
        'Margin %':        r.income > 0 ? +((r.profit / r.income) * 100).toFixed(1) : 0,
      }));
      return {
        rows, sheetName: 'Profit & Loss',
        headers:   ['Month', 'Income (₹)', 'Expenses (₹)', 'Purchases (₹)', 'Net Profit (₹)', 'Margin %'],
        colWidths: [16, 16, 16, 16, 16, 12],
      };
    }

    if (t === 'customer') {
      const rows = this.custReportRows().map(r => ({
        'Customer':       r.customerName,
        'Phone':          r.phone,
        'Type':           r.customerType,
        'Orders':         r.totalOrders,
        'Sales (₹)':      r.totalSales,
        'Paid (₹)':       r.totalPaid,
        'Due (₹)':        r.totalDue,
        'Last Order':     this.fmtDate(r.lastOrderDate),
      }));
      return {
        rows, sheetName: 'Customer Report',
        headers:   ['Customer', 'Phone', 'Type', 'Orders', 'Sales (₹)', 'Paid (₹)', 'Due (₹)', 'Last Order'],
        colWidths: [22, 16, 10, 10, 14, 14, 14, 14],
      };
    }

    if (t === 'expense') {
      const rows = this.expenseRows().map(r => ({
        'Expense Type':  r.type,
        'Entries':       r.count,
        'Amount (₹)':    r.amount,
        'Share %':       this.expensePct(r.amount),
      }));
      return {
        rows, sheetName: 'Expenses',
        headers:   ['Expense Type', 'Entries', 'Amount (₹)', 'Share %'],
        colWidths: [22, 12, 16, 12],
      };
    }

    if (t === 'purchase') {
      const rows = this.purReportRows().map(r => ({
        'Supplier':       r.supplierName,
        'Phone':          r.phone ?? '',
        'Orders':         r.totalPurchases,
        'Total Amount (₹)': r.totalAmount,
        'Paid (₹)':       r.totalPaid,
        'Due (₹)':        r.totalDue,
        'Last Purchase':  this.fmtDate(r.lastPurchaseDate),
      }));
      return {
        rows, sheetName: 'Purchase Report',
        headers:   ['Supplier', 'Phone', 'Orders', 'Total Amount (₹)', 'Paid (₹)', 'Due (₹)', 'Last Purchase'],
        colWidths: [24, 16, 10, 18, 14, 14, 16],
      };
    }

    return { rows: [], headers: [], colWidths: [], sheetName: 'Report' };
  }

  private _reportLabel(): string {
    return this.reports.find(r => r.type === this.activeReport())?.label ?? this.activeReport();
  }

  private _download(blob: Blob, filename: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── Helpers ───────────────────────────────────────────────────
  private _pageNums(cur: number, total: number): number[] {
    const nums: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) nums.push(i);
    return nums;
  }

  localDateStr(d: Date): string {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  today(): string { return this.localDateStr(new Date()); }

  daysAgo(n: number): string {
    const d = new Date(); d.setDate(d.getDate() - n);
    return this.localDateStr(d);
  }

  fmtDate(s: string | null | undefined): string {
    if (!s || s === '—') return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  fmtMoney(n: number): string {
    const abs = Math.abs(n); const sign = n < 0 ? '-' : '';
    if (abs >= 100000) return sign + '₹' + (abs / 100000).toFixed(1) + 'L';
    if (abs >= 1000)   return sign + '₹' + (abs / 1000).toFixed(1) + 'K';
    return sign + '₹' + Math.round(abs);
  }
}