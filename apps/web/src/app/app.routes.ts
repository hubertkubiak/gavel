import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Gavel — aukcje na żywo',
    loadComponent: () => import('./features/item-list/item-list.page').then((m) => m.ItemListPage),
  },
  {
    path: 'items/:id',
    title: 'Gavel — licytacja',
    loadComponent: () =>
      import('./features/item-detail/item-detail.page').then((m) => m.ItemDetailPage),
  },
  {
    path: 'nickname',
    title: 'Gavel — wybierz nick',
    loadComponent: () => import('./features/nickname/nickname.page').then((m) => m.NicknamePage),
  },
  { path: '**', redirectTo: '' },
];
