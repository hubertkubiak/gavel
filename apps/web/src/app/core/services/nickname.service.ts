import { Service, computed, signal } from '@angular/core';

const KEY = 'gavel.nickname';
export const NICK_PATTERN = /^[\p{L}\p{N}_.-]{3,20}$/u;

/** A stored nick the server would reject (e.g. edited by hand) counts as no nick at all. */
function read(): string | null {
  try {
    const nick = localStorage.getItem(KEY);
    return nick && NICK_PATTERN.test(nick) ? nick : null;
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
