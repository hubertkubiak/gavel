import { Component, computed, input } from '@angular/core';
import { thumbs } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';

const cache = new Map<string, string>();

export function avatarUri(seed: string): string {
  let uri = cache.get(seed);
  if (!uri) {
    uri = createAvatar(thumbs, { seed, radius: 50, scale: 90 }).toDataUri();
    cache.set(seed, uri);
  }
  return uri;
}

/** Deterministic DiceBear avatar generated from a nick (inline data URI, so no NgOptimizedImage). */
@Component({
  selector: 'gv-avatar',
  template: `<img
    [src]="src()"
    [width]="size()"
    [height]="size()"
    alt=""
    class="rounded-full bg-surface-2"
  />`,
  host: { class: 'inline-flex shrink-0' },
})
export class Avatar {
  readonly nick = input.required<string>();
  readonly size = input(28);
  protected readonly src = computed(() => avatarUri(this.nick()));
}
