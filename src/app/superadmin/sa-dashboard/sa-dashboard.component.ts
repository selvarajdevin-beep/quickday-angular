// src/app/features/superadmin/sa-dashboard/sa-dashboard.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { RouterModule }   from '@angular/router';
import { SuperAdminService } from '../../services/superadmin.service';
import { SuperAdminDashboardDto } from '../../models/superadmin.models';

@Component({
  selector:    'app-sa-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterModule],
  templateUrl: './sa-dashboard.component.html',
  styleUrls:   ['.././sa-shared.css'],
})
export class SaDashboardComponent implements OnInit {

  isLoading = signal(true);
  stats     = signal<SuperAdminDashboardDto | null>(null);
  error     = signal('');

  constructor(private svc: SuperAdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading.set(true);
    this.svc.getDashboard().subscribe({
      next:  d => { this.stats.set(d); this.isLoading.set(false); },
      error: (e: Error) => { this.error.set(e.message); this.isLoading.set(false); },
    });
  }

  planPercent(count: number): number {
    const total = this.stats()?.totalShops ?? 0;
    return total ? Math.round((count / total) * 100) : 0;
  }
}
