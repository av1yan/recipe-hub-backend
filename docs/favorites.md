# Favorites (saved recipes)

The heart on a recipe saves it to the person's own list. It used to only flip a
bit of local state — pretty, but it forgot the moment you left the screen and
led nowhere. It now persists and has somewhere to land.

## Data model

A `SavedRecipe` row joins a user to a recipe, with `@@unique([userId, recipeId])`
so the same recipe can't be saved twice. Both sides cascade on delete, so
removing a user or a recipe cleans up its saves.

## API

| Method | Path | Does |
| --- | --- | --- |
| `POST` | `/api/recipes/:id/save` | Favorite the recipe |
| `DELETE` | `/api/recipes/:id/save` | Unfavorite it |
| `GET` | `/api/recipes/saved/all` | The person's saved recipes |

`GET /api/recipes` (the list behind "Your Recipes") also returns an
**`isFavorite`** boolean per recipe, scoped to the requesting user via a filtered
`savedBy` include. That single field drives the heart's initial state, the badge,
and the filter — the client never has to cross-reference the saved list itself.

## How it behaves

- **Save/unsave are idempotent.** Save is an upsert and unsave is a `deleteMany`,
  so favoriting something already favorited, or unfavoriting something that
  isn't, is a no-op — not a `P2002`/`P2025` surfacing as a 500.
- **`isFavorite` is per-user.** Two people looking at the same recipe see their
  own heart; the field is computed from the caller's saves, not the recipe's.
- **The heart is optimistic.** It flips immediately and rolls back if the
  save/unsave call fails, so a dropped request can't leave it lying.

## On the client

- **Recipe screen** — the heart persists on tap and reads "♥ Saved" while active.
- **Home → Your Recipes** — favorited recipes get a heart badge, and a
  "Favorites (n)" chip filters the shelf to just those. The chip only appears
  when there's at least one favorite, so it's never a dead control.

## What has been tested

Verified against the live production backend: a save writes a `SavedRecipe` row,
an unsave removes it, `GET /api/recipes` reports the right `isFavorite`, and the
full browser flow — favorite, see the badge and filter, reopen showing "Saved",
unfavorite back to a clean list — behaves. The idempotency was confirmed by
toggling the same recipe repeatedly without a 500.
