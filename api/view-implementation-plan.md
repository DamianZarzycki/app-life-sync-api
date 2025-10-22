# API Endpoint Implementation Plan: GET /api/me

## 1. Przegląd punktu końcowego
Endpoint zwraca minimalny kontekst uwierzytelnionego użytkownika wraz z flagami hydratacji profilu i preferencji. Służy do natychmiastowego załadowania stanu aplikacji po logowaniu/odświeżeniu strony.

## 2. Szczegóły żądania
- **Metoda HTTP**: GET
- **URL**: /api/me
- **Parametry**: Brak parametrów w query i body
- **Nagłówki wymagane**:
  - `Authorization: Bearer <JWT>` – token Supabase uzyskany w front-endzie

## 3. Wykorzystywane typy
- **MeResponseDto** (src/types.ts l.38-44)
- **ErrorResponseDto** (src/types.ts l.17-23)

## 4. Szczegóły odpowiedzi
| Kod | Opis | Body |
|-----|------|------|
|200 OK|Pomyślne pobranie kontekstu|`MeResponseDto`|
|401 Unauthorized|Brak lub niepoprawny token|`ErrorResponseDto` (code: "unauthorized")|
|500 Internal Server Error|Błąd nieoczekiwany|`ErrorResponseDto` (code: "internal_error")|

## 5. Przepływ danych
1. Frontend wysyła GET `/api/me` z nagłówkiem `Authorization`.
2. `supabaseAuthMiddleware` weryfikuje podpis JWT i udostępnia `req.user` (uuid).
3. Kontroler deleguje do `userContextService.getUserContext(userId)`.
4. Service wykonuje równoległe zapytania do Supabase:
   - `auth.users` → email, email_verified
   - `profiles` (select exists) → `hasProfile`
   - `preferences` (select exists) → `hasPreferences`
5. Service buduje `MeResponseDto` i zwraca do kontrolera.
6. Kontroler serializuje DTO → JSON i zwraca `200`.

## 6. Względy bezpieczeństwa
- Uwierzytelnianie: Walidacja tokenu przez middleware korzystające z klucza publicznego Supabase JWKS.
- Autoryzacja: End-point dostępny wyłącznie dla zalogowanych użytkowników (brak dodatkowych ról).
- Ochrona przed SSRF/SQLi: Supabase JS klient z parametryzowanymi zapytaniami.
- Brak danych wrażliwych (np. hash haseł) w odpowiedzi.

## 7. Obsługa błędów
| Scenariusz | Kod | message |
|------------|-----|---------|
|Brak nagłówka `Authorization`|401|"authorization_header_missing"|
|Token nieważny / wygasły|401|"invalid_token"|
|Błąd komunikacji z Supabase|500|"supabase_error"|
|Inny nieoczekiwany błąd|500|"internal_error"|

Błędy aplikacyjne logujemy do centralnego loggera (np. pino) oraz – gdy to błąd krytyczny – do tabeli `error_logs` (jeśli istnieje) za pomocą `errorLoggingService`.

## 8. Rozważania dotyczące wydajności
- Łączenie zapytań: wykorzystać Supabase RPC lub pojedyncze zapytanie `select exists()` dla każdej tabeli w jednej transakcji.
- Cache JWKS w middleware, by nie pobierać kluczy przy każdym żądaniu.
- Odpowiedź mały payload (< 1 KB) → brak kompresji koniecznej.

## 9. Etapy wdrożenia
1. **Middleware**: Skonfigurować / zweryfikować `supabaseAuthMiddleware` (validacja JWT, attach `req.user`).
2. **DTO import**: Upewnić się, że `MeResponseDto` jest eksportowany z `src/types.ts`.
3. **Service**: Utworzyć `userContextService` w `src/services/userContext.service.ts`:
   ```ts
   export const getUserContext = async (userId: UUID): Promise<MeResponseDto> => {
     const [userRes, profileRes, prefRes] = await Promise.all([
       supabase.auth.admin.getUserById(userId),
       supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle(),
       supabase.from('preferences').select('id').eq('user_id', userId).maybeSingle(),
     ]);
     // map & return
   };
   ```
4. **Controller/Route**: Dodać plik `src/routes/me.router.ts`:
   ```ts
   router.get('/me', async (req, res, next) => {
     try {
       const dto = await userContextService.getUserContext(req.user.id);
       res.status(200).json(dto);
     } catch (err) {
       next(err);
     }
   });
   ```
5. **Error handling**: Rozszerzyć globalny `errorHandler` o mapowanie błędów Supabase na `ErrorResponseDto`.
6. **OpenAPI**: Zaktualizować dokumentację (yml) → `paths./api/me`.
7. **E2E tests**: Napisać testy w `tests/e2e/me.e2e.ts` (happy path + brak tokena).
8. **CI/CD**: Uruchomić testy oraz linter w GitHub Actions.
9. **Monitoring**: Dodać metrykę prom/prom-client `api_me_success_total`.
10. **Deploy**: Merge → build → deploy na DigitalOcean.
