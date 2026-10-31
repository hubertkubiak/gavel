import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { LucideGavel, LucideMoon, LucideSun, LucideTerminal } from '@lucide/angular';
import { NgxSonnerToaster } from 'ngx-sonner';
import { NicknameService } from './core/services/nickname.service';
import { ThemeService } from './core/services/theme.service';
import { DevPanel } from './shared/ui/dev-panel';
import { Avatar } from './shared/ui/avatar';

@Component({
  selector: 'gv-root',
  imports: [
    RouterOutlet,
    RouterLink,
    NgxSonnerToaster,
    DevPanel,
    Avatar,
    LucideGavel,
    LucideSun,
    LucideMoon,
    LucideTerminal,
  ],
  templateUrl: './app.html',
  host: {
    '(window:keydown)': 'onKeydown($event)',
  },
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly nickname = inject(NicknameService);
  private readonly router = inject(Router);
  protected readonly devPanelOpen = signal(false);

  /** Ctrl+. (⌘+. on macOS) toggles the gRPC dev panel. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === '.' && (event.ctrlKey || event.metaKey)) this.toggleDevPanel(event);
  }

  protected toggleDevPanel(event?: Event): void {
    event?.preventDefault();
    this.devPanelOpen.update((v) => !v);
  }

  protected changeNickname(): void {
    void this.router.navigate(['/nickname'], { queryParams: { returnUrl: this.router.url } });
  }
}
