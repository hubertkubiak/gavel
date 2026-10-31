import { Service, computed, signal } from '@angular/core';

const KEY = 'gavel.nickname';
export const NICK_PATTERN = /^[\p{L}\p{N}_.-]{3,20}$/u;

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** US-1: the only "identity" in Gavel — a nick kept in localStorage. */
@Service()
export class NicknameService {
  private readonly value = signal<string | null>(read());

  readonly nickname = this.value.asReadonly();
  readonly hasNickname = computed(() => !!this.value());

  set(nick: string): void {
    const clean = nick.trim();
    this.value.set(clean);
    try {
      localStorage.setItem(KEY, clean);
    } catch {
      /* private mode — keep it in memory */
    }
  }

  clear(): void {
    this.value.set(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
