// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard, guestGuard, moduleGuard, superAdminGuard } from './guards/auth.guard';

export const routes: Routes = [

  // ── Public ───────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard],
  },

  // ── Shell (all authenticated users) ──────────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [

      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // ── SuperAdmin routes ───────────────────────────────────────────────
      // Only accessible when isSuperAdmin === true.
      // superAdminGuard enforces this; authGuard on the Shell also redirects
      // SuperAdmin away from regular routes automatically.
      {
        path: 'superadmin',
        canActivate: [superAdminGuard],
        children: [
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
          // {
          //   path: 'dashboard',
          //   loadComponent: () =>
          //     import('./superadmin/sa-dashboard/sa-dashboard.component')
          //     .then(m => m.SaDashboardComponent),
          // },
          {
            path: 'shops',
            loadComponent: () =>
              import('./superadmin/sa-shops/sa-shops.component')
              .then(m => m.SaShopsComponent),
          },
          {
            path: 'billing',
            loadComponent: () =>
              import('./superadmin/sa-billing/sa-billing.component')
              .then(m => m.SaBillingComponent),
          },
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./superadmin/sa-revenue/sa-revenue.component')
              .then(m => m.SaCDashboardComponent),
          },          
        ],
      },

      // ── Regular routes — guarded by moduleGuard ─────────────────────────
      {
        path: 'dashboard',
        data: { module: 'Dashboard' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'billing',
        data: { module: 'Billing' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/billing/billing.component').then(m => m.BillingComponent),
      },
      {
        path: 'customers',
        data: { module: 'Customers' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/customer/customers.component').then(m => m.CustomersComponent),
      },
      {
        path: 'customers/:id/history',
        data: { module: 'Customers' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/customer/customer-history-modal.component').then(m => m.CustomerHistoryModalComponent),
      },
      {
        path: 'products',
        data: { module: 'Products' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/products/products.component').then(m => m.ProductsComponent),
      },
      {
        path: 'inventory',
        data: { module: 'Inventory' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/inventory/inventory.component').then(m => m.InventoryComponent),
      },
      {
        path: 'purchases',
        data: { module: 'Purchases' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/purchases/purchases.component').then(m => m.PurchasesComponent),
      },
      {
        path: 'expenses',
        data: { module: 'Expenses' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/expenses/expenses.component').then(m => m.ExpensesComponent),
      },
      {
        path: 'suppliers',
        data: { module: 'Suppliers' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/suppliers/suppliers.component').then(m => m.SuppliersComponent),
      },
      {
        path: 'reports',
        data: { module: 'Reports' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/reports/reports.component').then(m => m.ReportsComponent),
      },
      {
        path: 'users',
        data: { module: 'Users' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/users/users.component').then(m => m.UsersComponent),
      },
      {
        path: 'settings',
        data: { module: 'Settings' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/settings/settings.component').then(m => m.SettingsComponent),
      },
      {
        path: 'account',
        data: { module: 'Account' },
        canActivate: [moduleGuard],
        loadComponent: () =>
          import('./components/account/account.component').then(m => m.AccountComponent),
      },
    ],
  },

  { path: '**', redirectTo: 'dashboard' },
];