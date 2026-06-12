# Search tips endpoint integration

Add these pieces to the main TooDoo-Backend repo (files are scaffolded in this folder).

## 1. Mount route in `src/app.ts`

```typescript
import searchRoutes from './routes/search.routes';

// with other public routes
app.use('/search', searchRoutes);
```

## 2. Endpoint

`GET /search/tips` — public, no auth.

Query (all optional):

| Param | Description |
|-------|-------------|
| `take` | 1–20, default 8 |
| `city` | Appends city-specific variants (e.g. `pizza Helsingborg`) |
| `q` | Filters tips that contain this substring (for autocomplete) |

Response:

```json
{
  "tips": ["pizza", "Food", "sushi"],
  "total": 12,
  "take": 8
}
```

Tips are built from `src/data/search-tips.json` plus active category names from the database.

## 3. Tests

```bash
npm test -- src/tests/search.test.ts
```
