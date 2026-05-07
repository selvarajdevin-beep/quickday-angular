import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter }       from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes }              from './app.routes';
import { ConstantsService }    from './services/constants.service';
import { authInterceptor }     from './interceptors/auth.interceptor';
import { firstValueFrom }      from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
    provideAppInitializer(() => {
      const cs = inject(ConstantsService);
      return firstValueFrom(cs.load());
    }),
  ]
};