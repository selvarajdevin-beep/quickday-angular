// src/app/auth/register/register.component.ts
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { FormsModule }    from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService }      from '../../services/auth.service';
import { ConstantsService } from '../../services/constants.service';
import { ShopType }         from '../../services/shared-state.interfaces';

@Component({
  selector:    'app-register',
  standalone:  true,
  imports:     [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls:   ['./register.component.css'],
})
export class RegisterComponent {

  private readonly cSvc = inject(ConstantsService);

  step = signal<1 | 2>(1);

  // Step 1
  businessName     = signal('');
  ownerName        = signal('');
  businessPhone    = signal('');
  businessEmail    = signal('');
  address          = signal('');
  gstin            = signal('');
  shopType         = signal<ShopType | ''>('');
  showShopDropdown = signal(false);

  // Step 2
  username        = signal('');
  phone           = signal('');
  email           = signal('');
  password        = signal('');
  confirmPassword = signal('');
  showPwd         = signal(false);
  showConfirmPwd  = signal(false);
  agreedToTerms   = signal(false);

  isLoading = signal(false);
  errorMsg  = signal('');

  // ── Template uses: *ngFor="let type of shopTypes"
  //    then:  shopType() === type        (string === string ✓)
  //           selectShopType(type)       (string arg ✓)
  //           shopTypeIcons[type]        (string index ✓)
  //           {{ type }}                 (string display ✓)
  // So shopTypes MUST return string[].
  get shopTypes(): string[]             { return this.cSvc.shopTypeValues(); }

  // Template: shopTypeIcons[type]  where type is string
  get shopTypeIcons(): Record<string, string> { return this.cSvc.shopTypeIconMap(); }

  // ── Computed signals (used with () in template) ──────────────────────────
  readonly pwdStrength = computed(() => {
    const p = this.password();
    if (!p) return 0;
    let s = 0;
    if (p.length >= 6)           s++;
    if (p.length >= 10)          s++;
    if (/[A-Z]/.test(p))         s++;
    if (/[0-9]/.test(p))         s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  });

  readonly pwdStrengthLabel = computed(() => {
    const s = this.pwdStrength();
    if (s <= 1) return 'Weak';
    if (s <= 3) return 'Fair';
    return 'Strong';
  });

  readonly pwdStrengthColor = computed(() => {
    const s = this.pwdStrength();
    if (s <= 1) return '#EF4444';
    if (s <= 3) return '#F59E0B';
    return '#00C17B';
  });

  readonly passwordsMatch = computed(() =>
    this.password() !== '' && this.password() === this.confirmPassword()
  );

  // Template: {{ shopTypeLabel() }}
  readonly shopTypeLabel = computed(() => {
    return this.shopType() || 'Select shop type';
  });

  // Template: class="bi {{ shopTypeIcon() }}"
  readonly shopTypeIcon = computed(() => {
    const v = this.shopType();
    return v ? (this.cSvc.shopTypeIconMap()[v] ?? 'bi-shop') : 'bi-shop';
  });

  constructor(
    private auth:   AuthService,
    private router: Router,
  ) {}

  nextStep(): void {
    this.errorMsg.set('');
    if (!this.businessName().trim()) { this.errorMsg.set('Business name is required.'); return; }
    if (!this.ownerName().trim())    { this.errorMsg.set('Owner name is required.'); return; }
    if (!this.shopType())            { this.errorMsg.set('Please select your shop type.'); return; }
    if (this.businessPhone() && !/^\d{10}$/.test(this.businessPhone())) {
      this.errorMsg.set('Enter a valid 10-digit business phone number.'); return;
    }
    if (this.businessEmail() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.businessEmail())) {
      this.errorMsg.set('Enter a valid business email address.'); return;
    }
    this.step.set(2);
    this.showShopDropdown.set(false);
  }

  prevStep(): void { this.step.set(1); this.errorMsg.set(''); }

  // Template calls: (click)="selectShopType(type)"  where type is string
  selectShopType(type: string): void {
    this.shopType.set(type as ShopType);
    this.showShopDropdown.set(false);
  }

  register(): void {
    this.errorMsg.set('');
    if (!this.username().trim())            { this.errorMsg.set('Username is required.'); return; }
    if (!/^\d{10}$/.test(this.phone()))     { this.errorMsg.set('Enter a valid 10-digit mobile number.'); return; }
    if (this.email() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email())) {
      this.errorMsg.set('Enter a valid email address.'); return;
    }
    if (this.password().length < 6)         { this.errorMsg.set('Password must be at least 6 characters.'); return; }
    if (!this.passwordsMatch())             { this.errorMsg.set('Passwords do not match.'); return; }
    if (!this.agreedToTerms())              { this.errorMsg.set('Please agree to the Terms of Service.'); return; }

    this.isLoading.set(true);
    this.auth.register({
      businessName:    this.businessName(),
      ownerName:       this.ownerName(),
      businessPhone:   this.businessPhone(),
      businessEmail:   this.businessEmail(),
      address:         this.address(),
      gstin:           this.gstin(),
      shopType:        this.shopType() as ShopType,
      username:        this.username(),
      phone:           this.phone(),
      email:           this.email(),
      password:        this.password(),
      confirmPassword: this.confirmPassword(),
    }).subscribe({
      next:  () => { this.router.navigate(['/login'], { queryParams: { registered: 'true' } }); },
      error: (err: Error) => { this.errorMsg.set(err.message); this.isLoading.set(false); },
    });
  }

  // Template: trackBy: trackByType  where item is string
  trackByType(_index: number, type: string): string { return type; }
}