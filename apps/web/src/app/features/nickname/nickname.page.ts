import { Component, computed, inject, input, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LucideArrowRight } from '@lucide/angular';
import { NICK_PATTERN, NicknameService } from '../../core/services/nickname.service';
import { Avatar } from '../../shared/ui/avatar';

/** US-1: choose a nick (3–20 chars), stored in localStorage, then go back where you came from. */
@Component({
  selector: 'gv-nickname-page',
  imports: [FormField, Avatar, LucideArrowRight],
  template: `
    <div class="mx-auto mt-6 max-w-md sm:mt-16">
      <div class="card fade-up p-6 sm:p-8">
        <div class="mb-6 flex items-center gap-4">
          <gv-avatar [nick]="preview()" [size]="56" />
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">Jak mamy Cię wołać?</h1>
            <p class="mt-1 text-sm text-muted">
              Nick pojawi się przy Twoich ofertach. Bez haseł — to demo.
            </p>
          </div>
        </div>

        <form (submit)="save($event)" novalidate>
          <label for="nick" class="mb-2 block text-sm font-medium">Nick</label>
          <input
            id="nick"
            class="input"
            autocomplete="nickname"
            [formField]="nickForm.nick"
            [attr.aria-invalid]="showErrors() ? 'true' : null"
            aria-describedby="nick-help"
          />
          <p
            id="nick-help"
            class="mt-2 min-h-5 text-sm"
            [class.text-danger]="showErrors()"
            [class.text-muted]="!showErrors()"
            aria-live="polite"
          >
            {{ showErrors() ? firstError() : '3–20 znaków: litery, cyfry, _ . -' }}
          </p>
          <button type="submit" class="btn btn-primary mt-4 h-11 w-full">
            Zaczynam licytować
            <svg lucideArrowRight [size]="16" aria-hidden="true"></svg>
          </button>
        </form>
      </div>
    </div>
  `,
})
export class NicknamePage {
  private readonly nicknames = inject(NicknameService);
  private readonly router = inject(Router);
  /** Bound from the `?returnUrl=` query param. */
  readonly returnUrl = input<string>();

  private readonly model = signal({ nick: this.nicknames.nickname() ?? '' });
  protected readonly nickForm = form(this.model, (p) => {
    required(p.nick, { message: 'Podaj nick' });
    minLength(p.nick, 3, { message: 'Nick musi mieć co najmniej 3 znaki' });
    maxLength(p.nick, 20, { message: 'Nick może mieć najwyżej 20 znaków' });
    pattern(p.nick, NICK_PATTERN, { message: 'Dozwolone: litery, cyfry oraz _ . -' });
  });

  protected readonly preview = computed(() => this.model().nick.trim() || 'gavel');
  protected readonly showErrors = computed(
    () => this.nickForm.nick().touched() && this.nickForm.nick().invalid(),
  );
  protected readonly firstError = computed(() => this.nickForm.nick().errors()[0]?.message ?? '');

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.nickForm, async () => {
      this.nicknames.set(this.model().nick);
      const target = this.returnUrl();
      await this.router.navigateByUrl(target?.startsWith('/') ? target : '/');
      return undefined;
    });
  }
}
