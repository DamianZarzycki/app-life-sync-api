# LifeSync Backend - Setup Checklist

## ✅ Checklist Instalacji

### Pre-Installation
- [ ] Masz zainstalowany Node.js 18+ (`node --version`)
- [ ] Masz zainstalowany npm (`npm --version`)
- [ ] Masz konto Supabase i projekt utworzony
- [ ] Wiesz gdzie znaleźć klucze Supabase (API URL i Service Role Key)

### Instalacja
- [ ] Zainstalowałeś zależności: `npm install`
- [ ] Wygenerowano plik `package-lock.json`
- [ ] Folder `node_modules` jest obecny

### Konfiguracja
- [ ] Utworzyłeś plik `.env` w katalogu głównym
- [ ] Wstawiłeś `SUPABASE_URL` do `.env`
- [ ] Wstawiłeś `SUPABASE_SERVICE_KEY` do `.env`
- [ ] Ustawiłeś `PORT=3000` (lub inny port)
- [ ] Ustawiłeś `NODE_ENV=development`

### Struktury Plików
- [ ] ✅ `/src/db/supabase.client.ts` - Inicjalizacja klienta
- [ ] ✅ `/src/middleware/supabase.middleware.ts` - Middleware
- [ ] ✅ `/src/types/express.d.ts` - Type definitions
- [ ] ✅ `/src/index.ts` - Main server file

### Build & Run
- [ ] Serwer uruchamia się bez błędów: `npm run dev`
- [ ] Endpoint `/api/health` zwraca 200 OK
- [ ] Endpoint `/api/test` zwraca dane z Supabase

## 🚀 Quick Start Commands

```bash
# 1. Instalacja
npm install

# 2. Konfiguracja .env
cat > .env << EOF
SUPABASE_URL=your_url
SUPABASE_SERVICE_KEY=your_key
PORT=3000
NODE_ENV=development
EOF

# 3. Uruchomienie dev serwera
npm run dev

# 4. Test w innym terminalu
curl http://localhost:3000/api/health
```

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "LifeSync API is running"
}
```

### Supabase Connection
```bash
curl http://localhost:3000/api/test
```

Expected response:
```json
{
  "status": "ok",
  "data": [...]
}
```

## 🔍 Troubleshooting

### Problem: "Cannot find module 'express'"
**Solution**: Uruchom `npm install`

### Problem: "Missing Supabase environment variables"
**Solution**: Sprawdź czy `.env` ma `SUPABASE_URL` i `SUPABASE_SERVICE_KEY`

### Problem: "Port 3000 already in use"
**Solution**: Zmień PORT w `.env` na inny, np. `PORT=3001`

### Problem: "Connection refused to Supabase"
**Solution**: 
- Sprawdź czy `SUPABASE_URL` jest prawidłowy
- Sprawdź czy `SUPABASE_SERVICE_KEY` jest prawidłowy (service role, nie anon key)
- Sprawdź połączenie internetowe

### Problem: "TypeScript compilation errors"
**Solution**: Uruchom `npm run lint:fix`

## 📦 Struktura po Instalacji

```
app-life-sync-api/
├── src/
│   ├── db/
│   │   ├── database.types.ts
│   │   └── supabase.client.ts
│   ├── middleware/
│   │   └── supabase.middleware.ts
│   ├── types/
│   │   └── express.d.ts
│   └── index.ts
├── .env                    ← MUSISZ UTWORZYĆ
├── package.json
├── tsconfig.json
└── node_modules/           ← UTWORZONY PO npm install
```

## 🎯 Co Dalej?

Po pomyślnym setupie backendu:

1. **Testy manualne** - Sprawdź endpoints w Postmanie lub curl
2. **Nowe routes** - Dodaj feature-específiczne endpoints
3. **Frontend integration** - Połącz Angular frontend z tym API
4. **Deployment** - Wdrażanie na produkcję

## ℹ️ Ważne Notatki

- ⚠️ **NIGDY** nie commituj `.env` do gita!
- 📝 Zawsze używaj **Service Role Key** dla backendu
- 🔒 Chronić swoje klucze Supabase
- 🧪 Testuj endpoints przed deplojem
- 📚 Sprawdzaj dokumentację Supabase dla nowych features

---

**Status**: Gotowy do setup'u! 🚀

