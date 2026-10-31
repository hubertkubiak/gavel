# Gavel — specyfikacja aplikacji aukcyjnej na żywo

Oct 31, 2026 · @Hubert

## Cel i zakres

Gavel to mini aukcja online, w której front w Angularze komunikuje się z backendem w Node.js wyłącznie przez gRPC (protokoły gRPC-Web i Connect). Projekt pokazuje trzy rzeczy: kontrakt-first z Protocol Buffers, wywołania unary oraz server streaming na żywo w przeglądarce.

**Nazwa:** Gavel (ang. młotek licytacyjny). Repozytorium `gavel`, pakiety `@gavel/web`, `@gavel/api` i `@gavel/proto`; logo oparte na ikonie młotka z Lucide w kolorze akcentu.

**W zakresie:**

- jeden kontrakt `.proto` jako źródło typów dla frontu i backendu,
- lista aukcji, szczegóły przedmiotu i składanie ofert (unary),
- podgląd ofert na żywo w wielu kartach przeglądarki (server streaming),
- obsługa błędów gRPC w UI, interceptory (autoryzacja „na niby”, logowanie czasu),
- prosta identyfikacja użytkownika przez nick zapisany w `localStorage`.

**Poza zakresem:**

- prawdziwe logowanie, płatności i trwała baza danych (dane w pamięci serwera),
- client streaming i bidirectional streaming — przeglądarka ich nie obsługuje przez gRPC-Web/Connect, co jest świadomie opisane w README,
- proxy Envoy — serwer Connect obsługuje gRPC-Web natywnie,
- deployment produkcyjny (opcjonalne rozszerzenie).

## Architektura i stack

Front i backend łączy wyłącznie wygenerowany z `.proto` pakiet; przez sieć idą wywołania unary oraz jeden strumień zdarzeń z serwera do przeglądarki.

&#91;embedded content: architektura · front, backend i wspólny kontrakt\]

Strzałki w kontenerach pokazują kierunek wywołań; wyróżniona linia to `WatchItem`, jedyne połączenie, które zostaje otwarte.

**Monorepo:**

```text
apps/
  web/                 // Angular
  api/                 // Node.js + Fastify + Connect
packages/
  proto/
    auction/v1/auction.proto
    gen/               // wynik buf generate (w .gitignore lub commitowany)
buf.yaml
buf.gen.yaml
docker-compose.yml
```

**Stack:**

| Warstwa | Narzędzia |
| --- | --- |
| Kontrakt | Buf CLI (`lint`, `breaking`, `generate`), `protoc-gen-es` (protobuf-es v2) |
| Backend | Node.js LTS, Fastify, `@connectrpc/connect-node`, `@connectrpc/connect-fastify`, `@connectrpc/cors` |
| Frontend | Angular (standalone, signals), `@connectrpc/connect-web`, RxJS |
| UI | Tailwind CSS v4, spartan/ui lub Angular Material 3, Lucide |
| Testy | Vitest, Angular Testing Library, Playwright |
| Monorepo i CI | pnpm workspaces lub Nx, GitHub Actions, Docker Compose |

Wersje bibliotek warto sprawdzić przy starcie projektu — ekosystem Connect szybko się zmienia.

## Kontrakt API

Cały kontrakt mieści się w jednym pliku `proto/auction/v1/auction.proto` z jednym serwisem i czterema RPC. Wersja `v1` w pakiecie pozwala później pokazać ewolucję kontraktu bez łamania klientów.

```protobuf
syntax = "proto3";

package auction.v1;

import "google/protobuf/timestamp.proto";

service AuctionService {
  // unary: lista aktywnych i zakończonych aukcji
  rpc ListItems(ListItemsRequest) returns (ListItemsResponse);
  // unary: szczegóły jednego przedmiotu z historią ofert
  rpc GetItem(GetItemRequest) returns (GetItemResponse);
  // unary: złożenie oferty
  rpc PlaceBid(PlaceBidRequest) returns (PlaceBidResponse);
  // server streaming: zdarzenia dla jednego przedmiotu na żywo
  rpc WatchItem(WatchItemRequest) returns (stream ItemEvent);
}

enum ItemStatus {
  ITEM_STATUS_UNSPECIFIED = 0;
  ITEM_STATUS_ACTIVE = 1;
  ITEM_STATUS_ENDED = 2;
}

message Money {
  int64 amount_minor = 1;   // grosze, bez floatów
  string currency = 2;      // "PLN"
}

message Bid {
  string id = 1;
  string item_id = 2;
  string bidder = 3;
  Money amount = 4;
  google.protobuf.Timestamp placed_at = 5;
}

message Item {
  string id = 1;
  string title = 2;
  string description = 3;
  string image_url = 4;
  Money starting_price = 5;
  Money current_price = 6;
  Money min_increment = 7;
  int32 bid_count = 8;
  string leading_bidder = 9;
  google.protobuf.Timestamp ends_at = 10;
  ItemStatus status = 11;
}

message ListItemsRequest {
  ItemStatus status = 1;    // UNSPECIFIED = wszystkie
}
message ListItemsResponse {
  repeated Item items = 1;
}

message GetItemRequest {
  string item_id = 1;
}
message GetItemResponse {
  Item item = 1;
  repeated Bid recent_bids = 2;  // ostatnie 20, najnowsze pierwsze
}

message PlaceBidRequest {
  string item_id = 1;
  Money amount = 2;
  // bidder pochodzi z nagłówka autoryzacji, nie z body
}
message PlaceBidResponse {
  Bid bid = 1;
  Item item = 2;
}

message WatchItemRequest {
  string item_id = 1;
}

message ItemEvent {
  oneof event {
    Item snapshot = 1;       // pierwsze zdarzenie po podłączeniu
    Bid bid_placed = 2;
    Item auction_ended = 3;
  }
  int32 viewers = 10;        // ilu klientów ogląda przedmiot
}
```

**Kody błędów używane przez serwer:**

| Kod gRPC | Kiedy | Komunikat w UI |
| --- | --- | --- |
| `INVALID_ARGUMENT` | kwota ≤ 0, zła waluta, puste `item_id` | „Nieprawidłowa kwota” |
| `NOT_FOUND` | nieznany przedmiot | „Ta aukcja nie istnieje” |
| `FAILED_PRECONDITION` | oferta poniżej `current_price + min_increment` lub aukcja zakończona | „Oferta za niska — minimum X zł” / „Aukcja zakończona” |
| `UNAUTHENTICATED` | brak nagłówka `Authorization` | przekierowanie do wyboru nicku |
| `RESOURCE_EXHAUSTED` | więcej niż 5 ofert na sekundę od jednego użytkownika | „Zwolnij — za dużo ofert” |
| `UNAVAILABLE` | serwer nieosiągalny, zerwany stream | baner „Łączę ponownie…” |

Szczegóły błędu walidacji (np. wymagana minimalna kwota) serwer przekazuje w `ConnectError.details` jako typowany message `BidRejectedDetail { Money minimum_bid = 1; }`, zdefiniowany w tym samym pliku.

## Wymagania funkcjonalne

Sześć historyjek pokrywa całe demo; US-4 jest kluczowa, bo pokazuje streaming.

| ID | Historyjka | Kryteria akceptacji | RPC |
| --- | --- | --- | --- |
| US-1 | Jako użytkownik wybieram nick, żeby móc licytować | Nick 3–20 znaków, zapisany w `localStorage`; bez nicku przycisk „Licytuj” prowadzi do formularza nicku | — |
| US-2 | Jako użytkownik widzę listę aukcji | Karty z tytułem, zdjęciem, aktualną ceną, liczbą ofert i odliczaniem do końca; filtr Aktywne / Zakończone / Wszystkie; skeleton podczas ładowania | `ListItems` |
| US-3 | Jako użytkownik oglądam szczegóły przedmiotu | Opis, cena, prowadzący, minimalna następna oferta, 20 ostatnich ofert; nieznane ID → ekran „Ta aukcja nie istnieje” | `GetItem` |
| US-4 | Jako użytkownik widzę nowe oferty na żywo | Oferta z innej karty pojawia się w mniej niż 1 s bez odświeżania; cena i historia aktualizują się; licznik oglądających; po zerwaniu połączenia baner i automatyczny reconnect z backoffem | `WatchItem` |
| US-5 | Jako użytkownik składam ofertę | Pole kwoty wstępnie wypełnione minimalną ofertą; przycisk zablokowany w trakcie wysyłki; sukces → toast; błąd → komunikat z tabeli kodów błędów | `PlaceBid` |
| US-6 | Jako użytkownik wiem, że aukcja się skończyła | O `ends_at` stream wysyła `auction_ended`; formularz znika, pojawia się zwycięzca i kwota | `WatchItem` |

**Scenariusz demo (do nagrania GIF-a do README):**

1. Dwie karty przeglądarki z tym samym przedmiotem, dwa różne nicki.
2. W karcie A oferta 150 zł → w karcie B cena i historia zmieniają się natychmiast.
3. W karcie B oferta 140 zł → błąd `FAILED_PRECONDITION` z minimalną kwotą.
4. Zatrzymanie serwera → baner „Łączę ponownie…”, start serwera → stream wraca i dostaje świeży snapshot.
5. Koniec czasu aukcji → obie karty pokazują zwycięzcę.

## Backend

Serwer to Fastify z pluginem Connect, dane trzymane w pamięci i rozgłaszane przez `EventEmitter` per przedmiot. Wystarcza to, żeby streaming działał w wielu kartach, bez Redisa i bazy.

**Struktura `apps/api`:**

```text
src/
  main.ts                 // Fastify + fastifyConnectPlugin + CORS
  routes.ts               // router.service(AuctionService, impl)
  auction.service.ts      // implementacja 4 RPC
  auction.store.ts        // Map<itemId, Item>, Map<itemId, Bid[]>, seed
  auction.events.ts       // EventEmitter: 'bid:<id>', 'ended:<id>'
  auth.interceptor.ts     // odczyt nicku z nagłówka Authorization
  scheduler.ts            // zamykanie aukcji o ends_at
```

**Logika:**

- **Seed:** 6 przedmiotów przy starcie, czasy końca rozłożone od 3 do 30 minut, żeby w demo jakaś aukcja zawsze się kończyła. Zmienna `SEED_FAST=1` skraca je do 1–5 minut.
- **Autoryzacja:** nagłówek `Authorization: Bearer <nick>`. Interceptor odrzuca brak nagłówka kodem `UNAUTHENTICATED` i wkłada nick do `contextValues`. Wyłącznie na potrzeby demo — bez haseł.
- **PlaceBid:** walidacja w kolejności z tabeli błędów; zapis i emisja zdarzenia odbywają się synchronicznie w jednym ticku pętli zdarzeń, więc dwie równoległe oferty nie przejdą obie na tę samą cenę.
- **Rate limit:** prosty licznik w pamięci, 5 ofert na sekundę na nick → `RESOURCE_EXHAUSTED`.
- **WatchItem:** handler jako `async function*`. Najpierw `yield` snapshotu, potem pętla po zdarzeniach z emitera (np. przez `on()` z `node:events`). Gdy klient się rozłączy, `AbortSignal` z kontekstu kończy pętlę i usuwa listener.
- **Licznik oglądających:** inkrementacja przy starcie streamu, dekrementacja w `finally`; zmiana licznika też jest emitowana.
- **Heartbeat:** co 15 s stream wysyła `ItemEvent` z samym `viewers`, żeby proxy i przeglądarka nie zamykały bezczynnego połączenia.
- **Scheduler:** `setTimeout` na `ends_at` każdego przedmiotu; zmienia status i emituje `auction_ended`.
- **CORS:** zezwolenie na origin frontu (`http://localhost:4200`) oraz na nagłówki i nagłówki odpowiedzi wymagane przez Connect i gRPC-Web (gotowe listy w pakiecie `@connectrpc/cors`).
- **Opóźnienie testowe:** zmienna `LATENCY_MS` dodaje sztuczne opóźnienie do unary, żeby pokazać skeletony i blokowanie przycisku.

## Frontend

Front to standalone Angular z signals, w którym cała wiedza o gRPC siedzi w warstwie `data-access`. Komponenty widzą tylko Observable i signale, nie wiedzą nic o transporcie.

**Struktura `apps/web`:**

```text
src/app/
  core/grpc/
    transport.ts            // createConnectTransport + interceptory
    grpc-client.token.ts    // InjectionToken<Client<typeof AuctionService>>
    from-stream.ts          // AsyncIterable -> Observable z AbortController
    grpc-error.ts           // ConnectError -> komunikat dla UI
    interceptors/
      auth.interceptor.ts   // Authorization: Bearer <nick>
      timing.interceptor.ts // console.debug nazwy RPC i czasu
  data-access/
    auction.api.ts          // cienki wrapper na klienta (unary -> Observable)
    item-live.store.ts      // stan przedmiotu na żywo (signals)
  features/
    nickname/               // US-1
    item-list/              // US-2
    item-detail/            // US-3, US-4, US-6
    bid-form/               // US-5
  shared/ui/                // countdown, money pipe, toast, baner połączenia
```

**Kluczowe elementy:**

1. **Transport.** `createConnectTransport({ baseUrl, interceptors, useBinaryFormat })` dostarczany przez `provideGrpc()` w `app.config.ts`. Flaga `useBinaryFormat` z `environment` przełącza binarny protobuf i JSON, co pokazuje się w zakładce Network. Wariant alternatywny: `createGrpcWebTransport` — jedna linia różnicy.
2. **`fromStream()`.** Funkcja przyjmuje fabrykę `(signal: AbortSignal) => AsyncIterable<T>` i zwraca `Observable<T>`. Subskrypcja tworzy `AbortController`, pętla `for await` emituje `next`, błąd idzie do `error`, a `unsubscribe` wywołuje `abort()`. Dzięki temu `takeUntilDestroyed()` w komponencie zamyka stream na serwerze.
3. **`ItemLiveStore`.** Serwis per widok (provider w komponencie `item-detail`) z signalami `item`, `bids`, `viewers`, `connection: 'connecting' | 'live' | 'reconnecting' | 'ended'`. Zdarzenia z `oneof` obsługiwane przez `switch (event.event.case)`; TypeScript wymusza obsłużenie wszystkich przypadków.
4. **Reconnect.** Stream opakowany w `retry({ delay })` z backoffem 1 s, 2 s, 4 s… do 30 s, tylko dla kodów `UNAVAILABLE` i `UNKNOWN`. Po ponownym połączeniu pierwszy `snapshot` nadpisuje stan, więc żadna oferta nie ginie.
5. **Unary.** `AuctionApi` zamienia Promise klienta na Observable (`from()`) albo używa `resource()` / `rxResource()` dla listy i szczegółów. Sygnał przerwania przekazywany w `CallOptions.signal` przy zmianie trasy.
6. **Optymistyczne UI — świadomie nie.** Po `PlaceBid` UI czeka na zdarzenie ze streamu, żeby pokazać, że stream jest jedynym źródłem prawdy; odpowiedź unary służy tylko do toasta.
7. **Błędy.** `toUiError(err)` używa `ConnectError.from(err)`, mapuje `code` na komunikat z tabeli w sekcji Kontrakt API i odczytuje `BidRejectedDetail` przez `err.findDetails()`.
8. **Formatowanie pieniędzy.** `MoneyPipe` zamienia `amount_minor` (bigint z protobuf-es) na `Intl.NumberFormat('pl-PL', { style: 'currency', currency })`.

**Widoki:**

| Trasa | Komponent | Co pokazuje |
| --- | --- | --- |
| `/` | `ItemListPage` | siatka kart, filtr statusu, odliczanie |
| `/items/:id` | `ItemDetailPage` | szczegóły, historia ofert, licznik oglądających, baner połączenia, `BidForm` |
| `/nickname` | `NicknamePage` | formularz nicku, powrót do poprzedniej trasy |

## Wygląd i UX

Aplikacja ma wyglądać jak współczesny produkt, a nie demo techniczne: jasny i ciemny motyw, płynne animacje przy każdej ofercie ze streamu i układ dopracowany na telefonie. Ruch na ekranie jest tu argumentem — to on sprzedaje „na żywo”.

**Kierunek wizualny:**

- Styl „clean dark-first”: ciemne tło grafitowe, jedna mocna barwa akcentu (np. elektryczny fiolet albo limonka) tylko dla ceny, przycisku „Licytuj” i pulsującej kropki „LIVE”.
- Typografia: Inter albo Geist do tekstu, wersja mono (Geist Mono / JetBrains Mono) do kwot i odliczania, z `font-variant-numeric: tabular-nums`, żeby cyfry nie skakały.
- Karty z dużym zdjęciem, zaokrągleniem 16 px, subtelną ramką zamiast cieni; na liście układ bento — pierwsza aukcja kończąca się najszybciej jest dwa razy większa.
- Szkło (backdrop-blur) wyłącznie na pasku górnym i banerze połączenia, nigdzie więcej.

**Stack UI:**

- Tailwind CSS v4 z tokenami w `@theme` (kolory, promienie, odstępy) i przełącznikiem motywu na klasie `dark` + `prefers-color-scheme` jako domyślny.
- Komponenty: spartan/ui (styl shadcn dla Angulara) albo Angular Material 3 z własnym motywem — jedno do wyboru, nie oba.
- Ikony: Lucide (`lucide-angular`).

**Mikrointerakcje, które pokazują streaming:**

1. Nowa oferta wjeżdża na górę historii z animacją (Angular `@angular/animations` lub `animate.enter` z CSS) i podświetla się na 1,5 s.
2. Cena „przelicza się” licznikiem od starej do nowej wartości w ok. 400 ms; przy przebiciu Twojej oferty krótki czerwony błysk i toast „Ktoś Cię przebił”.
3. Pulsująca kropka „LIVE” przy połączonym streamie, szara przy reconnect — stan widać bez czytania.
4. Odliczanie zmienia kolor na ostrzegawczy w ostatniej minucie i przyspiesza puls w ostatnich 10 s.
5. Przejście z listy do szczegółów przez View Transitions API (`withViewTransitions()` w routerze) — zdjęcie karty płynnie rośnie do nagłówka.
6. Koniec aukcji: konfetti (np. `canvas-confetti`) tylko u zwycięzcy.
7. Skeletony zamiast spinnerów, przycisk z loaderem w środku podczas `PlaceBid`.

**Mobile i dostępność:**

- Mobile-first; na telefonie formularz oferty jako przyklejony dolny pasek z szybkimi przyciskami „+10 zł / +50 zł / +100 zł”.
- Historia ofert w regionie `aria-live="polite"`, żeby czytnik ekranu ogłaszał nowe oferty.
- `prefers-reduced-motion` wyłącza liczniki, konfetti i View Transitions.
- Kontrast WCAG AA w obu motywach, pełna obsługa klawiaturą.

**Dodatkowe elementy, które podnoszą odbiór:**

- Awatary generowane z nicku (np. DiceBear) przy ofertach.
- Mini wykres przebiegu ceny w szczegółach (sparkline z historii ofert).
- Panel deweloperski (przełączany `Ctrl+.`): ostatnie wywołania RPC, czas, rozmiar, format binary/JSON — pokazuje gRPC „od środka” bez otwierania DevTools.

## Wymagania niefunkcjonalne i testy

Projekt uruchamia się jedną komendą i przechodzi pełne CI na każdym PR.

**Wymagania niefunkcjonalne:**

| Obszar | Wymaganie |
| --- | --- |
| Uruchomienie | `pnpm i && pnpm dev` startuje API i front; alternatywnie `docker compose up` |
| Opóźnienie streamu | oferta widoczna w innej karcie w < 1 s lokalnie |
| Wydajność frontu | Lighthouse ≥ 90 (Performance, Accessibility); lazy loading tras |
| Typy | `strict: true` w obu aplikacjach; zero ręcznie pisanych typów DTO — wszystko z `buf generate` |
| Kontrakt | `buf lint` i `buf breaking` w CI względem gałęzi `main` |
| Jakość | ESLint + Prettier, Husky z lint-staged |
| Dokumentacja | README z GIF-em scenariusza demo, diagramem i sekcją „Dlaczego Connect, a nie Envoy + gRPC-Web” |

**Testy:**

- **Backend — unit (Vitest):** walidacja `PlaceBid` dla każdego kodu błędu, rate limit, zamykanie aukcji.
- **Backend — integracja:** prawdziwy serwer na losowym porcie + klient `@connectrpc/connect-node`; test streamu: subskrypcja, oferta z drugiego klienta, sprawdzenie zdarzenia `bid_placed`, przerwanie i weryfikacja licznika oglądających.
- **Front — unit (Jest lub Vitest):** `fromStream()` (emisja, błąd, `abort` przy unsubscribe), `toUiError()`, `ItemLiveStore` z mockowanym klientem (Connect pozwala podstawić transport w pamięci przez `createRouterTransport`).
- **Front — komponenty:** Angular Testing Library dla `BidForm` (walidacja, blokada przycisku, komunikaty).
- **E2E (Playwright):** scenariusz z dwoma kontekstami przeglądarki — oferta w jednym, asercja w drugim; plus test reconnect po restarcie serwera.
- **CI (GitHub Actions):** lint → `buf lint/breaking` → testy → build → E2E na każdym PR.

## Plan prac

Pięć etapów, każdy kończy się działającym przyrostem, który da się pokazać. Kolejność stawia streaming przed wyglądem, żeby najtrudniejsza część była gotowa najwcześniej.

1. **Fundament.** Monorepo (pnpm workspaces lub Nx), `auction.proto`, `buf.yaml` + `buf.gen.yaml`, pakiet `@gavel/proto` z wygenerowanym kodem, szkielet API i Angulara. *Gotowe, gdy:* front wywołuje `ListItems` i wyświetla surową listę.
2. **Unary end-to-end.** `GetItem`, `PlaceBid`, nick, interceptory, mapowanie błędów. *Gotowe, gdy:* da się licytować i każdy kod błędu ma komunikat.
3. **Streaming.** `WatchItem`, `fromStream()`, `ItemLiveStore`, reconnect, licznik oglądających, scheduler końca aukcji. *Gotowe, gdy:* przechodzi cały scenariusz demo w dwóch kartach.
4. **Wygląd.** Tailwind + biblioteka komponentów, motywy, mikrointerakcje, mobile, dostępność, panel deweloperski. *Gotowe, gdy:* Lighthouse ≥ 90 i animacje respektują `prefers-reduced-motion`.
5. **Jakość i prezentacja.** Testy, Playwright, CI, Docker Compose, README z GIF-em. *Gotowe, gdy:* PR przechodzi pełne CI, a repo uruchamia się jedną komendą.

**Rozszerzenia (opcjonalnie):**

- Deployment: API na Fly.io lub Render, front na Vercel/Netlify — z publicznym linkiem do demo w README.
- Angular SSR z wywołaniami unary po stronie serwera (transport `connect-node` w SSR, `connect-web` w przeglądarce) i transfer state.
- Drugi klient w React z tym samym `@gavel/proto` — pokazuje, że kontrakt jest niezależny od frameworka.
- Prawdziwa baza (PostgreSQL + Drizzle) i Redis pub/sub zamiast `EventEmitter`, żeby streaming działał przy kilku instancjach API.
- Widget aukcji jako remote w micro-frontendowym pulpicie, ze wspólnym transportem.
