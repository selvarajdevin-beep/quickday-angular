// account.component.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read-only view of the currently logged-in user's account details.
// No edit actions are exposed — this page is intentionally view-only.
// Data is sourced entirely from AuthService.currentUser() (JWT / localStorage)
// so no API call is required.
// ─────────────────────────────────────────────────────────────────────────────
import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector:    'app-account',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './account.component.html',
  styleUrls:   ['./account.component.css'],
})
export class AccountComponent {

  currentUser  = computed(() => this.auth.currentUser());
  isAdmin      = computed(() => this.auth.isAdmin());
  businessName = computed(() => this.auth.businessName());

  constructor(private auth: AuthService) {}

  // ── Helpers ───────────────────────────────────────────────
  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarBg(): string {
    return this.currentUser()?.themeColor || '#0057FF';
  }

  formatExpiry(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }

  planBadgeClass(plan: string | undefined): string {
    switch ((plan ?? '').toLowerCase()) {
      case 'pro':        return 'badge-pro';
      case 'enterprise': return 'badge-enterprise';
      default:           return 'badge-free';
    }
  }
}
