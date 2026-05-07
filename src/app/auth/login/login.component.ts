import { Component, signal } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { FormsModule }       from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService }       from '../../services/auth.service';

@Component({
  selector:    'app-login',
  standalone:  true,
  imports:     [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls:   ['./login.component.css']
})
export class LoginComponent {

  // ── Form fields ───────────────────────────────────────
  phone     = signal('');
  password  = signal('');
  showPwd   = signal(false);

  // ── UI state ──────────────────────────────────────────
  isLoading = signal(false);
  errorMsg  = signal('');

  constructor(
    private auth:  AuthService,
    private router: Router,
    private route:  ActivatedRoute
  ) {}

  // ── Submit ────────────────────────────────────────────
  login(): void {
    this.errorMsg.set('');

    // Client-side guard
    if (!this.phone().trim()) {
      this.errorMsg.set('Please enter your phone number.'); return;
    }
    if (!/^\d{10}$/.test(this.phone())) {
      this.errorMsg.set('Enter a valid 10-digit mobile number.'); return;
    }
    if (!this.password().trim()) {
      this.errorMsg.set('Please enter your password.'); return;
    }

    this.isLoading.set(true);

    this.auth.login({
      phone:    this.phone(),
      password: this.password()
    }).subscribe({
      next: () => {
        const returnUrl =
          this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err: Error) => {
        this.errorMsg.set(err.message);
        this.isLoading.set(false);
      }
    });
  }

  fillDemo(type: 'admin' | 'worker') {
    this.phone.set(type === 'admin' ? '9999999999' : '1234567890');
    this.password.set(type === 'admin' ? 'Selva@123' : 'Selva@123');
    this.errorMsg.set('');
  }
}
