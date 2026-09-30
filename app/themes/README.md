# Immersive colors

Next Play uses one immersive layout. `cinema.css` defines that layout and its default Mint palette. Ocean, Violet, Amber, and Rose override only its color variables. `index.css` applies the shared variables to components and portals.

To add a palette:

1. Add a `cinema-*` entry to `THEMES` in `lib/themes.ts` with its Spanish label and an English translation in `lib/translations.ts`.
2. Add its `html[data-theme='cinema-*']` variables at the end of `cinema.css`: accent, RGB accent, hover, gradient end, text on accent, and selected surface.
3. Check cards, navigation, modals, keyboard focus, contrast, and small screens. Every palette must retain the immersive layout and video/art previews.

The choice is saved under `nextplay-theme`. Missing, unknown, blocked-storage, and retired Legacy/Steam/PS5/Switch 2 choices fall back to Mint (`cinema`). The initial script and selector share the same catalog.

The header's English/Spanish selector stores `nextplay-language` separately. `useLanguage` subscribes components to changes; `lib/i18n.ts` translates UI copy, formats locales, and chooses Steam tag display names without changing tag IDs. API requests send `Accept-Language`; `server/i18n.ts` isolates each request's language, including streamed recommendations. Unknown language values fall back to Spanish. Personal notes, metadata from external sources without translations, and historical conversations retain their original content.
