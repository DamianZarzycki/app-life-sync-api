# LifeSync API Backend

Backend API dla aplikacji LifeSync - zbudowany z Node.js, Express i Supabase.

## Stack Technologiczny

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4
- **Baza Danych**: Supabase (PostgreSQL)
- **Język**: TypeScript 5
- **Port**: 3000 (domyślnie)

## Wymagania

- Node.js 18 lub nowszy
- npm lub yarn
- Konto Supabase z dostępem do bazy danych

## Setup

### 1. Instalacja zależności

```bash
npm install
```

### 2. Konfiguracja zmiennych środowiskowych

Utwórz plik `.env` w katalogu głównym (lub skopiuj z `.env.example`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
PORT=3000
NODE_ENV=development
```

**Ważne**: Zawsze używaj `SUPABASE_SERVICE_KEY` (service role key) dla backendu, nigdy anonimowego klucza!

### 3. Uruchomienie w trybie development

```bash
npm run dev
```

Server będzie dostępny pod adresem `http://localhost:3000`

## Skrypty

| Skrypt | Opis |
|--------|------|
| `npm run dev` | Uruchomienie serwera w trybie development z hot-reload |
| `npm run build` | Kompilacja TypeScript do JavaScript |
| `npm start` | Uruchomienie skompilowanego serwera |
| `npm run lint` | Sprawdzenie kodu ESLint |
| `npm run lint:fix` | Naprawienie problemów ESLint |
| `npm run format` | Formatowanie kodu Prettier |
| `npm run format:check` | Sprawdzenie formatowania |

## Struktura projektu

```
src/
├── db/
│   ├── database.types.ts       # Typy wygenerowane z Supabase
│   └── supabase.client.ts      # Inicjalizacja klienta Supabase
├── middleware/
│   └── supabase.middleware.ts  # Middleware dołączający Supabase do request
├── types/
│   └── express.d.ts            # TypeScript definicje dla Express
└── index.ts                     # Główny plik serwera
supabase/
├── config.toml                 # Konfiguracja Supabase
└── migrations/                 # Migracje bazy danych
```

## API Endpoints

### Health Check

```
GET /api/health
```

Zwraca status serwera.

**Odpowiedź:**
```json
{
  "status": "ok",
  "message": "LifeSync API is running"
}
```

### Test - Połączenie z Supabase

```
GET /api/test
```

Testuje połączenie z bazą danych.

**Odpowiedź:**
```json
{
  "status": "ok",
  "data": [...]
}
```

## Rozwój

### Tworzenie nowych route'ów

Wszystkie route'y automatycznie mają dostęp do klienta Supabase przez `req.supabase`:

```typescript
app.get('/api/example', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('table_name')
      .select('*');
    
    if (error) throw error;
    
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
```

### Typowanie danych

Wszystkie typy z Supabase są automatycznie dostępne z `database.types.ts`:

```typescript
import type { Database } from '../db/database.types';

type User = Database['public']['Tables']['users']['Row'];
```

## Wdrażanie

### Build

```bash
npm run build
```

Skompilowane pliki będą w folderze `dist/`.

### Produkcja

```bash
npm start
```

Upewnij się, że wszystkie zmienne środowiskowe są ustawione dla produkcji.

## Troubleshooting

### Błąd: "Missing Supabase environment variables"

Upewnij się, że w pliku `.env` są ustawione `SUPABASE_URL` i `SUPABASE_SERVICE_KEY`.

### Błąd: "Cannot find module"

Uruchom `npm install` aby zainstalować wszystkie zależności.

### Serwer nie uruchamia się

Sprawdź czy port 3000 jest dostępny lub ustaw inny port w zmiennej `PORT`.

## Licencja

ISC

