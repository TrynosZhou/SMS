import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.css']
})
export class SplashComponent implements OnInit, OnDestroy {
  private navigateTimeoutId?: ReturnType<typeof setTimeout>;
  private settingsSubscription?: Subscription;

  schoolName = 'Junior Primary School';
  schoolLogo: string | null = null;
  readonly defaultLogoPath = 'assets/logo.jpg';
  readonly tagline = 'School Management System – Powered by Trynos Zhou';
  loadingSettings = true;

  constructor(
    private router: Router,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadSettings();

    // Automatically redirect to login after short delay
    this.navigateTimeoutId = setTimeout(() => {
      this.router.navigate(['/login']);
    }, 3500);
  }

  ngOnDestroy(): void {
    if (this.navigateTimeoutId) {
      clearTimeout(this.navigateTimeoutId);
    }

    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
    }
  }

  private loadSettings(): void {
    this.settingsSubscription = this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings?.schoolName) {
          this.schoolName = settings.schoolName;
        }
        if (settings?.schoolLogo) {
          this.schoolLogo = settings.schoolLogo;
        } else if (settings?.schoolLogo2) {
          this.schoolLogo = settings.schoolLogo2;
        }
        this.loadingSettings = false;
      },
      error: () => {
        this.loadingSettings = false;
      }
    });
  }
}

