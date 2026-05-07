// src/app/services/constants.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fetches GET /api/settings/constants once per app session and exposes the
// results as Angular Signals so any component can react to them.
//
// Usage:
//   Inject ConstantsService and read the typed signal:
//     this.cSvc.shopTypes()         → AppConstantItem[]
//     this.cSvc.expenseTypeValues() → string[]   ('Petrol','Salary',…)
//     this.cSvc.unitTypesForShop('Bakery') → string[]
//
// Bootstrapping:
//   Call ConstantsService.load() once from AppComponent.ngOnInit()
//   (or from an APP_INITIALIZER — see comment at the bottom of this file).
//   All signals start as empty arrays so the app is usable even before
//   load() completes.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, map } from 'rxjs';
import { AppConstantItem, AppConstantsDto } from '../models/constants.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

const EMPTY: AppConstantsDto = {
  paymentTypes:      [],
  orderStatuses:     [],
  purchaseStatuses:  [],
  customerTypes:     [],
  expenseTypes:      [],
  gstTypes:          [],
  subscriptionPlans: [],
  currencies:        [],
  themeColors:       [],
  salaryTypes:       [],
  appModules:        [],
  shopTypes:         [],
  shopUnitTypes:     {},
  shopCategories:    {},
  planFeatures:      {},
  planPricing:  {},
};

@Injectable({ providedIn: 'root' })
export class ConstantsService {

  // private readonly api = '/api/settings/constants';
  private readonly api = `${environment.apiUrl}/settings/constants`;

  // ── Internal signal — holds the full DTO ─────────────────────────────────
  private readonly _data = signal<AppConstantsDto>(EMPTY);

  // ── Flag so callers can show a skeleton while loading ─────────────────────
  readonly isLoaded = signal(false);

  // ── Public typed signals (derived from _data) ─────────────────────────────

  /** e.g. [{value:'Cash',label:'Cash',icon:null}, …] */
  readonly paymentTypes      = computed(() => this._data().paymentTypes);
  readonly orderStatuses     = computed(() => this._data().orderStatuses);
  readonly purchaseStatuses  = computed(() => this._data().purchaseStatuses);
  readonly customerTypes     = computed(() => this._data().customerTypes);
  readonly expenseTypes      = computed(() => this._data().expenseTypes);
  readonly gstTypes          = computed(() => this._data().gstTypes);
  readonly subscriptionPlans = computed(() => this._data().subscriptionPlans);
  readonly currencies        = computed(() => this._data().currencies);
  readonly themeColors       = computed(() => this._data().themeColors);
  readonly salaryTypes       = computed(() => this._data().salaryTypes);
  readonly appModules        = computed(() => this._data().appModules);
  readonly shopTypes         = computed(() => this._data().shopTypes);

  // ── Convenience: just the value strings ──────────────────────────────────
  readonly paymentTypeValues      = computed(() => this._values(this._data().paymentTypes));
  readonly orderStatusValues      = computed(() => this._values(this._data().orderStatuses));
  readonly purchaseStatusValues   = computed(() => this._values(this._data().purchaseStatuses));
  readonly customerTypeValues     = computed(() => this._values(this._data().customerTypes));
  readonly expenseTypeValues      = computed(() => this._values(this._data().expenseTypes));
  readonly subscriptionPlanValues = computed(() => this._values(this._data().subscriptionPlans));
  readonly shopTypeValues         = computed(() => this._values(this._data().shopTypes));
  readonly appModuleValues        = computed(() => this._values(this._data().appModules));

  // ── Shop icon map: value → icon class ────────────────────────────────────
  readonly shopTypeIconMap = computed(() =>
    Object.fromEntries(
      this._data().shopTypes.map(t => [t.value, t.icon ?? 'bi-shop'])
    ) as Record<string, string>
  );

  // ── Module icon map: value → icon class ──────────────────────────────────
  readonly moduleIconMap = computed(() =>
    Object.fromEntries(
      this._data().appModules.map(m => [m.value, m.icon ?? 'bi-circle'])
    ) as Record<string, string>
  );

  // ── Currency symbol map: value → symbol (stored in icon field) ───────────
  readonly currencySymbolMap = computed(() =>
    Object.fromEntries(
      this._data().currencies.map(c => [c.value, c.icon ?? c.value])
    ) as Record<string, string>
  );

  // ── Plan features map ─────────────────────────────────────────────────────
  readonly planFeatures = computed(() => this._data().planFeatures);

  // Alongside planFeatures computed signal
  readonly planPricing = computed(() => this._data().planPricing);

  // Convenience method matching the pattern used in SaBillingComponent
  readonly planMonthlyRates = computed(
    () => this._data().planPricing   // already Record<string, number>
  );

  constructor(private http: HttpClient) {}

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  /**
   * Call this once on app startup (e.g. AppComponent.ngOnInit or
   * APP_INITIALIZER).  Safe to call multiple times — only fetches once.
   */
  load(): Observable<AppConstantsDto> {
    if (this.isLoaded()) return of(this._data());

    return this.http
      .get<ApiResponse<AppConstantsDto>>(this.api)
      .pipe(
        tap(res => {
          if (res.success && res.data) {
            this._data.set(res.data);
            this.isLoaded.set(true);
          }
        }),
        // If the call fails, the app still works with empty defaults.
        catchError(err => {
          console.error('[ConstantsService] Failed to load constants:', err);
          this.isLoaded.set(true);
          return of({ success: false, data: EMPTY } as ApiResponse<AppConstantsDto>);
        }),
        // Unwrap the ApiResponse envelope so the return type is Observable<AppConstantsDto>.
        // The signal is already updated in tap() above; this map just satisfies the
        // declared return type and gives APP_INITIALIZER a clean DTO to await.
        map(res => res.data ?? EMPTY),
      );
  }

  // ── Per-shop lookups ──────────────────────────────────────────────────────

  /** Returns unit type strings for the given shop type. */
  unitTypesForShop(shopType: string | undefined): string[] {
    return this._data().shopUnitTypes[shopType ?? 'Other']
      ?? this._data().shopUnitTypes['Other']
      ?? [];
  }

  /** Returns product category strings for the given shop type. */
  categoriesForShop(shopType: string | undefined): string[] {
    return this._data().shopCategories[shopType ?? 'Other']
      ?? this._data().shopCategories['Other']
      ?? [];
  }

  // In constants.service.ts — add alongside planFeatures()
// planMonthlyRates(): Record<string, number> {
//   // Ideally sourced from the same DB constants as plan names.
//   // If your AppConstantItem already carries a numeric metadata field, read it here.
//   return this.plans().reduce((acc, p) => {
//     acc[p.value] = p.monthlyRate ?? 0;   // if your model has monthlyRate
//     return acc;
//   }, {} as Record<string, number>);
// }
  // ── Helpers ───────────────────────────────────────────────────────────────

  private _values(items: AppConstantItem[]): string[] {
    return items.map(i => i.value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL: APP_INITIALIZER — loads constants before any component renders.
// Add to app.config.ts providers array:
//
//   import { APP_INITIALIZER }   from '@angular/core';
//   import { ConstantsService }  from './services/constants.service';
//   import { firstValueFrom }    from 'rxjs';
//
//   {
//     provide: APP_INITIALIZER,
//     useFactory: (cs: ConstantsService) => () => firstValueFrom(cs.load()),
//     deps: [ConstantsService],
//     multi: true,
//   }
//
// This guarantees constants are ready before any route guard or component
// runs.  The tradeoff is a slight increase in initial load time
// (~1 extra HTTP round-trip before the app shows anything).
// ─────────────────────────────────────────────────────────────────────────────