// src/app/features/superadmin/sa-dashboard/sa-dashboard.component.ts
import {
  Component, OnInit, OnDestroy, AfterViewInit,
  signal, ElementRef, ViewChild, inject,
} from '@angular/core';
import { CommonModule }       from '@angular/common';
import { RouterModule }       from '@angular/router';
import { SuperAdminService }  from '../../services/superadmin.service';
import {
  SuperAdminDashboardDto,
  RevenueStatsDto,
} from '../../models/superadmin.models';

declare const Chart: any;
const CHARTJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';

@Component({
  selector:    'app-sa-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterModule],
  templateUrl: './sa-revenue.component.html',
  styleUrls:   ['./sa-revenue.component.css'],
})
export class SaCDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  // static: false — resolved after every change detection cycle
  // The canvas elements are ALWAYS present in DOM (no *ngIf wrapping them),
  // so @ViewChild will always find them after AfterViewInit.
  @ViewChild('barCanvas',   { static: false }) barCanvas!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('donutCanvas', { static: false }) donutCanvas!: ElementRef<HTMLCanvasElement>;

  private svc = inject(SuperAdminService);

  isLoadingDash = signal(true);
  isLoadingRev  = signal(true);
  errorDash     = signal('');
  errorRev      = signal('');

  dash = signal<SuperAdminDashboardDto | null>(null);
  rev  = signal<RevenueStatsDto | null>(null);

  // These signals control CSS visibility — NOT *ngIf
  // Canvas elements stay in DOM at all times so @ViewChild works
  hasBarData   = signal(false);
  hasDonutData = signal(false);

  private barChart:   any = null;
  private donutChart: any = null;
  private chartJsReady    = false;
  private viewReady       = false;
  private revDataReady    = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadChartJs();
    this.loadAll();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.tryBuildCharts();
  }

  ngOnDestroy(): void {
    this.barChart?.destroy();
    this.donutChart?.destroy();
  }

  // ── Chart.js loader ────────────────────────────────────────────────────────

  private loadChartJs(): void {
    if (typeof (window as any)['Chart'] !== 'undefined') {
      this.chartJsReady = true;
      return;
    }
    if (document.querySelector(`script[src="${CHARTJS_CDN}"]`)) {
      const poll = setInterval(() => {
        if (typeof (window as any)['Chart'] !== 'undefined') {
          clearInterval(poll);
          this.chartJsReady = true;
          this.tryBuildCharts();
        }
      }, 50);
      return;
    }
    const s    = document.createElement('script');
    s.src      = CHARTJS_CDN;
    s.async    = true;
    s.onload   = () => { this.chartJsReady = true; this.tryBuildCharts(); };
    s.onerror  = () => console.error('Chart.js CDN load failed.');
    document.head.appendChild(s);
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  loadAll(): void {
    this.loadDashboard();
    this.loadRevenue();
  }

  private loadDashboard(): void {
    this.isLoadingDash.set(true);
    this.errorDash.set('');
    this.svc.getDashboard().subscribe({
      next:  d => { this.dash.set(d); this.isLoadingDash.set(false); },
      error: (e: Error) => { this.errorDash.set(e.message); this.isLoadingDash.set(false); },
    });
  }

  private loadRevenue(): void {
    this.isLoadingRev.set(true);
    this.errorRev.set('');
    this.revDataReady = false;
    this.hasBarData.set(false);
    this.hasDonutData.set(false);
    this.barChart?.destroy();
    this.donutChart?.destroy();
    this.barChart   = null;
    this.donutChart = null;

    this.svc.getRevenueStats().subscribe({
      next: d => {
        this.rev.set(d);
        this.isLoadingRev.set(false);
        this.revDataReady = true;
        this.hasBarData.set(d.monthlyRevenue.some(m => m.revenue > 0));
        this.hasDonutData.set(d.planRevenue.length > 0);
        this.tryBuildCharts();
      },
      error: (e: Error) => { this.errorRev.set(e.message); this.isLoadingRev.set(false); },
    });
  }

  // ── Chart gate — all three conditions must be met ──────────────────────────

  private tryBuildCharts(): void {
    if (!this.chartJsReady || !this.viewReady || !this.revDataReady) return;
    // requestAnimationFrame ensures the browser has painted the canvas
    // at its final size before Chart.js measures it
    requestAnimationFrame(() => {
      if (this.hasBarData())   this.buildBarChart();
      if (this.hasDonutData()) this.buildDonutChart();
    });
  }

  // ── Builders ───────────────────────────────────────────────────────────────

  private buildBarChart(): void {
    const canvas = this.barCanvas?.nativeElement;
    if (!canvas) { console.warn('barCanvas not found'); return; }
    const d = this.rev();
    if (!d) return;

    this.barChart?.destroy();
    this.barChart = null;

    const isDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const labels  = d.monthlyRevenue.map(m => m.monthDisplay);
    const revenue = d.monthlyRevenue.map(m => m.revenue);

    this.barChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Revenue (₹)',
          data:            revenue,
          backgroundColor: isDark ? 'rgba(59,130,246,0.55)' : 'rgba(37,99,235,0.75)',
          borderColor:     isDark ? '#60a5fa'               : '#2563eb',
          borderWidth:     1.5,
          borderRadius:    5,
          borderSkipped:   false,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (c: any) => ` ₹${Number(c.raw).toLocaleString('en-IN')}` },
          },
        },
        scales: {
          x: {
            ticks: { autoSkip: false, maxRotation: 45,
                     color: isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: isDark ? '#9ca3af' : '#6b7280', font: { size: 11 },
                     callback: (v: number) => v >= 1000 ? '₹'+(v/1000).toFixed(0)+'k' : '₹'+v },
            grid: { color: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' },
          },
        },
      },
    });
  }

  private buildDonutChart(): void {
    const canvas = this.donutCanvas?.nativeElement;
    if (!canvas) { console.warn('donutCanvas not found'); return; }
    const d = this.rev();
    if (!d || !d.planRevenue.length) return;

    this.donutChart?.destroy();
    this.donutChart = null;

    const planColors: Record<string, string> = { Basic: '#3b82f6', Pro: '#7c3aed', Free: '#9ca3af' };
    const labels  = d.planRevenue.map(p => p.plan);
    const revenue = d.planRevenue.map(p => p.revenue);
    const colors  = labels.map(l => planColors[l] ?? '#6b7280');

    this.donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: revenue, backgroundColor: colors,
                     borderWidth: 2, borderColor: 'transparent', hoverOffset: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c: any) =>
                ` ₹${Number(c.raw).toLocaleString('en-IN')} (${d.planRevenue[c.dataIndex].revenuePercent}%)`,
            },
          },
        },
      },
    });
  }

  // ── Template helpers ───────────────────────────────────────────────────────

  planPercent(count: number): number {
    const t = this.dash()?.totalShops ?? 0;
    return t ? Math.round((count / t) * 100) : 0;
  }

  formatINR(n: number): string {
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  momClass(): string {
    const p = this.rev()?.momChangePercent ?? 0;
    return p > 0 ? 'mom-up' : p < 0 ? 'mom-down' : 'mom-flat';
  }

  momIcon(): string {
    const p = this.rev()?.momChangePercent ?? 0;
    return p > 0 ? 'bi-arrow-up-right' : p < 0 ? 'bi-arrow-down-right' : 'bi-dash';
  }

  planDotColor(plan: string): string {
    return plan === 'Basic' ? '#3b82f6' : plan === 'Pro' ? '#7c3aed' : '#9ca3af';
  }

  planBadgeClass(plan: string): string {
    return plan === 'Basic' ? 'plan-basic' : plan === 'Pro' ? 'plan-pro' : 'plan-free';
  }

  paymentMethodIcon(method: string | null): string {
    if (!method) return 'bi-cash';
    const m = method.toLowerCase();
    if (m.includes('upi'))  return 'bi-phone';
    if (m.includes('card')) return 'bi-credit-card';
    if (m.includes('net'))  return 'bi-bank';
    return 'bi-cash';
  }
}