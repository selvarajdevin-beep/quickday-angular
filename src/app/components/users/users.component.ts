// users.component.ts — SERVER-SIDE PAGINATION + ROLE FILTER
// Fix: formEmail.set(u.email ?? '') — u.email is string | undefined in AppUser
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedStateService, AppUser, UserRole } from '../../services/shared-state.service';

@Component({
  selector:    'app-users',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrls:   ['./users.component.css'],
})
export class UsersComponent implements OnInit {

  users     = signal<AppUser[]>([]);
  allUsers  = signal<AppUser[]>([]);
  isLoading = signal(true);
  isSaving  = signal(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  searchQuery  = signal('');
  filterRole   = signal<'All' | UserRole>('All');
  filterStatus = signal<'All' | 'Active' | 'Inactive'>('All');

  // ── Server-driven pagination ──────────────────────────────────────────────
  totalCount  = signal(0);
  currentPage = signal(1);
  pageSize    = signal(10);

  totalPages  = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
  pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
    return pages;
  });

  pagedUsers = computed(() => this.users());

  // ── Modal ─────────────────────────────────────────────────────────────────
  showModal   = signal(false);
  editingUser = signal<AppUser | null>(null);
  activeTab   = signal<'basic' | 'hr'>('basic');

  formName     = signal('');
  formPhone    = signal('');
  formEmail    = signal('');
  formRole     = signal<UserRole>('Worker');
  formPassword = signal('');
  showPassword = signal(false);

  formDesignation      = signal('');
  formDOJ              = signal('');
  formAddress          = signal('');
  formEmergencyContact = signal('');
  formNotes            = signal('');
  formMonthlySalary    = signal<number | null>(null);
  formSalaryType       = signal('Fixed');
  formBankAccount      = signal('');
  formBankName         = signal('');
  formIFSC             = signal('');

  // ── Reset password modal ──────────────────────────────────────────────────
  showResetModal = signal(false);
  resetUserId    = signal<number | null>(null);
  newPassword    = signal('');
  showNewPwd     = signal(false);

  // ── Delete confirm ────────────────────────────────────────────────────────
  deleteTarget = signal<AppUser | null>(null);

  // ── Detail drawer ─────────────────────────────────────────────────────────
  showDetailDrawer = signal(false);
  detailUser       = signal<AppUser | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  readonly roles: UserRole[] = ['Admin', 'Worker'];

  // ── KPI strip ─────────────────────────────────────────────────────────────
  activeCount = computed(() => this.allUsers().filter(u => u.status === 'Active').length);
  adminCount  = computed(() => this.allUsers().filter(u => u.role === 'Admin').length);
  workerCount = computed(() => this.allUsers().filter(u => u.role === 'Worker').length);
  totalSalary = computed(() =>
    this.allUsers()
      .filter(u => u.status === 'Active' && u.salaryDetails?.monthlySalary)
      .reduce((s, u) => s + (u.salaryDetails?.monthlySalary ?? 0), 0)
  );
  currency = computed(() => this.svc.currencySymbol());

  constructor(private svc: SharedStateService) {}

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.isLoading.set(true);
    this.loadUsers(err => {
      if (err) this.toast('Failed to load users. Please refresh.', 'error');
      this.isLoading.set(false);
    });
    this.svc.getUsers({ page: 1, pageSize: 999 }).subscribe({
      next: paged => this.allUsers.set(paged.items),
      error: ()   => { /* non-fatal */ },
    });
  }

  loadUsers(callback?: (err?: unknown) => void): void {
    const status = this.filterStatus();
    const role   = this.filterRole();
    this.svc.getUsers({
      page:     this.currentPage(),
      pageSize: this.pageSize(),
      search:   this.searchQuery().trim() || undefined,
      status:   status !== 'All' ? status : undefined,
      role:     role   !== 'All' ? role   : undefined,
    }).subscribe({
      next: paged => { this.users.set(paged.items); this.totalCount.set(paged.totalCount); callback?.(); },
      error: e => callback?.(e),
    });
  }

  trackById(_index: number, user: AppUser): number { return user.id; }

  onSearch(q: string): void        { this.searchQuery.set(q);    this.currentPage.set(1); this.loadUsers(); }
  onRoleFilter(r: string): void    { this.filterRole.set(r as any);   this.currentPage.set(1); this.loadUsers(); }
  onStatusFilter(s: string): void  { this.filterStatus.set(s as any); this.currentPage.set(1); this.loadUsers(); }
  clearFilters(): void             { this.searchQuery.set(''); this.filterRole.set('All'); this.filterStatus.set('All'); this.currentPage.set(1); this.loadUsers(); }
  goToPage(p: number): void        { if (p >= 1 && p <= this.totalPages()) { this.currentPage.set(p); this.loadUsers(); } }
  prevPage(): void                 { this.goToPage(this.currentPage() - 1); }
  nextPage(): void                 { this.goToPage(this.currentPage() + 1); }

  // ── Add / Edit ────────────────────────────────────────────────────────────
  openAdd(): void    { this.editingUser.set(null); this.activeTab.set('basic'); this.resetForm(); this.showModal.set(true); }
  openEdit(u: AppUser): void { this.editingUser.set(u); this.activeTab.set('basic'); this.fillForm(u); this.showModal.set(true); }
  closeModal(): void { this.showModal.set(false); }

  fillForm(u: AppUser): void {
    this.formName.set(u.name);
    this.formPhone.set(u.phone);
    this.formEmail.set(u.email ?? '');          // FIX: u.email is string | undefined
    this.formRole.set(u.role);
    this.formPassword.set('');
    this.formDesignation.set(u.designation       ?? '');
    this.formDOJ.set(u.dateOfJoining
      ? new Date(u.dateOfJoining).toISOString().slice(0, 10) : '');
    this.formAddress.set(u.address               ?? '');
    this.formEmergencyContact.set(u.emergencyContact ?? '');
    this.formNotes.set(u.notes                   ?? '');
    this.formMonthlySalary.set(u.salaryDetails?.monthlySalary ?? null);
    this.formSalaryType.set(u.salaryDetails?.salaryType   ?? 'Fixed');
    this.formBankAccount.set(u.salaryDetails?.bankAccount ?? '');
    this.formBankName.set(u.salaryDetails?.bankName       ?? '');
    this.formIFSC.set(u.salaryDetails?.ifsc               ?? '');
  }

  resetForm(): void {
    this.formName.set(''); this.formPhone.set(''); this.formEmail.set('');
    this.formRole.set('Worker'); this.formPassword.set('');
    this.formDesignation.set(''); this.formDOJ.set('');
    this.formAddress.set(''); this.formEmergencyContact.set('');
    this.formNotes.set(''); this.formMonthlySalary.set(null);
    this.formSalaryType.set('Fixed');
    this.formBankAccount.set(''); this.formBankName.set(''); this.formIFSC.set('');
  }

  save(): void {
    if (!this.formName().trim() || !this.formPhone().trim()) {
      this.toast('Name and phone are required.', 'error'); return;
    }
    const editing = this.editingUser();
    if (!editing && this.formPassword().length < 6) {
      this.toast('Password must be at least 6 characters.', 'error'); return;
    }
    this.isSaving.set(true);
    const data: Partial<AppUser> & { password?: string } = {
      name:             this.formName(),
      phone:            this.formPhone(),
      email:            this.formEmail()           || undefined,
      role:             this.formRole(),
      designation:      this.formDesignation()     || undefined,
      dateOfJoining:    this.formDOJ() ? new Date(this.formDOJ()) : undefined,
      address:          this.formAddress()         || undefined,
      emergencyContact: this.formEmergencyContact() || undefined,
      notes:            this.formNotes()           || undefined,
      salaryDetails: {
        salaryType:    this.formSalaryType() as any,
        monthlySalary: this.formMonthlySalary() ?? 0,
        bankAccount:   this.formBankAccount()   || undefined,
        bankName:      this.formBankName()      || undefined,
        ifsc:          this.formIFSC()          || undefined,
      },
      ...(!editing && { password: this.formPassword() }),
    };

    const op = editing ? this.svc.updateUser(editing.id, data) : this.svc.createUser(data);
    op.subscribe({
      next: () => {
        if (!editing) this.currentPage.set(1);
        this.loadUsers(); this.refreshKpis();
        this.toast(editing ? 'User updated successfully.' : 'User created successfully.', 'success');
        this.closeModal(); this.isSaving.set(false);
      },
      error: (err: Error) => { this.toast(err.message || 'Save failed.', 'error'); this.isSaving.set(false); },
    });
  }

  toggleStatus(u: AppUser): void {
    this.svc.toggleUserStatus(u.id).subscribe({
      next:  () => { this.loadUsers(); this.refreshKpis(); this.toast(`${u.name} status updated.`, 'success'); },
      error: (err: Error) => { this.toast(err.message || 'Failed to update status.', 'error'); },
    });
  }

  openDetail(u: AppUser): void { this.detailUser.set(u); this.showDetailDrawer.set(true); }
  closeDetail(): void          { this.showDetailDrawer.set(false); }

  openReset(u: AppUser): void { this.resetUserId.set(u.id); this.newPassword.set(''); this.showResetModal.set(true); }
  closeReset(): void          { this.showResetModal.set(false); }

  confirmReset(): void {
    const id = this.resetUserId();
    if (!id || this.newPassword().length < 6) { this.toast('Password must be at least 6 characters.', 'error'); return; }
    this.svc.resetPassword(id, this.newPassword()).subscribe({
      next:  () => { this.toast('Password reset successfully.', 'success'); this.closeReset(); },
      error: (err: Error) => { this.toast(err.message || 'Failed to reset password.', 'error'); },
    });
  }

  confirmDelete(u: AppUser): void { this.deleteTarget.set(u); }

  doDelete(): void {
    const u = this.deleteTarget();
    if (!u) return;
    this.svc.deleteUser(u.id).subscribe({
      next: () => {
        const newTotal = Math.max(0, this.totalCount() - 1);
        const maxPage  = Math.max(1, Math.ceil(newTotal / this.pageSize()));
        if (this.currentPage() > maxPage) this.currentPage.set(maxPage);
        this.loadUsers(); this.refreshKpis();
        this.toast('User deleted successfully.', 'success');
        this.deleteTarget.set(null);
      },
      error: (err: Error) => { this.toast(err.message || 'Failed to delete user.', 'error'); this.deleteTarget.set(null); },
    });
  }

  private refreshKpis(): void {
    this.svc.getUsers({ page: 1, pageSize: 999 }).subscribe({
      next: paged => this.allUsers.set(paged.items),
      error: () => { /* non-fatal */ },
    });
  }

  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  timeAgo(d: Date | null): string {
    if (!d) return 'Never';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  formatDate(d: Date | string | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatSalary(u: AppUser): string {
    const amt = u.salaryDetails?.monthlySalary;
    if (!amt) return '—';
    return `${this.currency()}${amt.toLocaleString('en-IN')}/mo`;
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarColor(id: number): string {
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4'][id % 6];
  }

  get showRange(): string {
    const total = this.totalCount();
    const from  = Math.min((this.currentPage() - 1) * this.pageSize() + 1, total);
    const to    = Math.min(this.currentPage() * this.pageSize(), total);
    return total === 0 ? '0 users' : `${from}–${to} of ${total}`;
  }
}