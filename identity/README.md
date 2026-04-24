# LFC Authenticator — Design System

> Identity system for **lfc-admin-gui** — the administrative panel of the LFC authentication ecosystem. Built for administrators managing systems, roles, permissions, JWT tokens, and access control.

Aesthetic: a **"secure terminal"** — technical, precise, confident. Green as brand (not as success), monospace for anything technical, generous white space without being sparse.

---

## Sources

| Source | Path / URL |
|---|---|
| Identity site (mounted codebase) | `identity/` — contains `index.html` (the spec doc), `tokens.css`, and `assets/` (logos) |
| Copied tokens | `tokens.css` (root) |
| Copied logos | `assets/logo-dark.svg`, `assets/logo-white.svg` |

No Figma, slide deck, or runnable product codebase was provided — only the identity spec page + tokens + brand SVG logos. The UI kit in this project is reconstructed from the components explicitly documented in the identity site (buttons, badges, inputs, cards, tables, alerts, permission chips, nav), not from real product screenshots.

Everything is in **Portuguese (pt-BR)** in the source material — UI copy, labels, section titles.

---

## Products represented

A single product: **`lfc-admin-gui`** — a React SPA admin panel. Its identity system is the subject of this design system.

Domain objects it manages:
- **Systems** (registered downstream services, e.g. `lfc-authenticator`, `lfc-kurtto`)
- **Routes** (endpoints per system)
- **Roles** (e.g. `root`, `admin`, `default`)
- **Permissions** (typed as `perm:Resource.Action`, e.g. `perm:Systems.Create`)
- **Clients** / **Users**
- **JWT tokens** (with a `tokenVersion` for invalidation)

---

## Content fundamentals

**Language:** Portuguese (pt-BR). Formal-neutral, no regional slang.

**Voice:** direct, technical, concrete. Administrators aren't novices — the system talks to them as peers. No friendly filler, no apology for errors, no "oops."

**Tone rules:**
- Prefer **concrete statements** with object + operation + result.
  *"Sistema desativado. Rotas continuam registradas."*
- Reference the exact identifier: `perm:Users.Delete`, `tokenVersion: 13`, `sys_a1b2c3`.
- Use **numbers** where available: *"12 usuários afetados por esta role."*
- HTTP status codes are legitimate copy: *"Erro 403: sem permissão para esta operação."*

**Do not:**
- Add cheerleading or emoji in outcomes (*"Sucesso! ✨"* — forbidden).
- Strip context from confirmations (*"Tem certeza?"* without saying what).
- Use vague states (*"Carregando... por favor aguarde."*). Always include the thing being loaded or the expected duration.
- Soften errors into euphemisms (*"Ops! Algo deu errado."*).

**Casing:** sentence case in UI copy. `UPPERCASE` is reserved for mono eyebrows / section labels with wide letter-spacing. Titles are in sentence case, never title case.

**Person:** third-person / system-voice for confirmations ("Sessão invalidada"), second-person *formal* ("você") in destructive-action dialogs. Never "tu", never first-person "I".

**Emoji:** rarely, and only in the internal identity-doc's philosophy cards (🎯 🔒 🌿 ⚡ 🔧 ♿). Never in production UI copy, toasts, or alerts.

**Numerical / technical formatting:**
- Permissions rendered as `perm:Resource.Action` with a faint `perm:` prefix.
- Time deltas: *"há 2 min"*, *"há 14 dias"* — short, mono font.
- Token identifiers: truncated with monospace (`sys_a1b2c3`).

---

## Visual foundations

**Palette.** Green is the brand, not a success color. Forest (`#16240F`) as deep background; Lime (`#AECA59`) as the singular primary accent; Hunter (`#5B7D47`) for quiet strokes. Only *four* status colors — success reuses lime, plus danger (warm red `#D95F5F`), warning (amber `#D9A24A`), info (sky blue `#4A9FD9`). The page background is a warm sage cream (`#F2F4EA`), not white — it tints every surface with the brand.

**Type.** **Geist** (loaded locally from `fonts/Geist-VariableFont_wght.ttf` — variable font, `wght` 100–900) for display, sans, and body — this is the brand font specified in the source tokens. Inter stays loaded as a fallback. JetBrains Mono for code, labels, permissions, and anything with a wide-tracked uppercase eyebrow. Mono appears *a lot* — it's part of the brand voice.

**Background texture.** A very faint grid overlay (`24px` cells on mobile, `40px` on desktop), drawn with `linear-gradient` 1px lines at 4% opacity. Never noisy, but always present — it signals "engineering tool." No photos, no illustrations, no full-bleed imagery.

**Decorative motif.** The fingerprint mark, scaled up to ~340px, placed at 5% opacity in the hero's bottom-right. That's the only illustration in the whole system.

**Animation.** Confirmatory, never decorative. Default ease: `cubic-bezier(0.16, 1, 0.3, 1)` (fast out, gentle settle). Fades on tooltips/modals (200ms). Slides on drawers (300ms). Scale with a slight overshoot `cubic-bezier(0.34,1.56,0.64,1)` on confirmations. Max 200ms for hover/focus. `prefers-reduced-motion` respected everywhere. **Never animate layout** (width/height) — only transform/opacity.

**Hover states.** Color shift, not elevation. Buttons shift to a lighter lime + pick up `--shadow-glow`. Ghost buttons get `--bg-elevated` behind them. Rows in tables tint to `--bg-elevated`. Never scale on hover except for color swatches in the docs.

**Press states.** Not explicitly specified in the source — default to 1px `translateY` down + darker background. Don't shrink.

**Borders.** Three tiers: `--border-subtle` (8% black — 95% of surfaces), `--border-base` (16% black — inputs, active areas), `--border-strong` (55% hunter — focus highlight, accent edges). Everything has a 1px border; no borderless cards.

**Shadows.** Layered and subtle. `--shadow-card` = 1px micro + 2px soft + 1px ring border. `--shadow-modal` = 24px drop + 4px soft + 1px ring. The **glow** (`0 0 24px rgba(174,202,89,0.30)`) is reserved — only on focused primary CTAs and the "Quick Reference" attention block.

**No gradients.** No blurry purple-to-pink washes. The only gradient usage is the hero's soft radial glow (rgba lime → transparent) behind the headline.

**Transparency / blur.** Sparing. The mobile topbar uses `backdrop-filter: saturate(140%) blur(10px)` over an 88%-opaque base color. The drawer backdrop is a 45% forest overlay. Elsewhere, solid.

**Corner radii.** `4 / 8 / 12 / 16 / 20 / 9999`. Default is `8px` (`--radius-md`) for buttons and inputs. Cards use `12px`. Logo container uses `10px` (custom). Badges and pills use `9999px`.

**Cards.** White surface, 1px subtle border, `12px` radius, no shadow at rest, `--shadow-card` on hover. Header + body pattern: header has a bottom border and a title + optional status badge; body has `1.5rem` padding.

**Imagery color vibe.** No stock photography. If imagery appears, it should lean warm-neutral — the brand background sets a sage-cream tone that would clash with cool/blue photos. For the current system, imagery is **zero** — structure, type, and color do all the work.

**Layout rules.**
- Sidebar is **fixed** (`220px`) on desktop (≥960px), converts to a `min(82vw, 320px)` drawer on mobile.
- Main content scrolls; sidebar is `position: sticky`.
- Section padding: fluid `clamp(2.5rem, 6vw, 5rem)` block, `clamp(1.25rem, 5vw, 5rem)` inline.
- Grid column for data: 12-col, `24px` gutter.
- Minimum tap target: `44px` (WCAG 2.5.5 AAA).

**Iconography.** Stroke-based, 1.5px weight, via **Lucide React** (recommended). Default size `16px` for inline, `20–24px` for nav. Color via `currentColor` so icons inherit the surrounding text color. See `ICONOGRAPHY` section below.

**Font files.** The brand font **Geist** (`fonts/Geist-VariableFont_wght.ttf`, variable 100–900) is the primary. **Inter** (`fonts/Inter-VariableFont_opsz_wght.ttf`, variable 100–900 / opsz 14–32) is loaded as a fallback. JetBrains Mono streams from Google Fonts. All three are wired via `colors_and_type.css`.

---

## Iconography

**Primary icon set: Lucide** (via CDN). The identity spec explicitly recommends `lucide-react` with:
- Stroke width: **1.5px**
- Default size: **16px** (inline), **20px** (nav), **24px** (illustrations)
- Color: **`currentColor`** — icons inherit text color

All icons in the identity spec are hand-written SVGs that match Lucide's visual language exactly (rounded line caps/joins, 24×24 viewBox). In this design system we **reference Lucide directly from CDN** rather than re-inlining hundreds of glyphs:

```html
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="shield"></i>
<script>lucide.createIcons();</script>
```

**Domain icons in use** (from the identity doc): `systems` (monitor), `routes` (shuffle), `roles` (users), `permissions` (lock), `clients` (user-plus), `users` (user), `token` (activity), `logout`, `settings`, `search`, `filter`, `plus`, `edit` (pencil), `trash`, `restore` (rotate-ccw), `check`.

**Brand SVGs** (copied to `assets/`):
- `logo-dark.svg` — forest ink, for light backgrounds
- `logo-white.svg` — lime stroke, for dark backgrounds

**Emoji usage:** zero in production UI. The only emojis in the entire source appear in internal philosophy cards (🎯🔒🌿⚡🔧♿) and are **not** part of the product brand. Don't propagate them.

**Unicode glyphs:** `✓` and `✕` used sparingly as voice-guide markers in do/don't columns; not a general pattern.

**No custom icon font.** No sprite sheet. No PNGs. Everything is SVG + currentColor.

---

## Index — what's in this project

```
README.md             ← you are here
SKILL.md              ← agent-skill entry point
tokens.css            ← original token file from the source codebase
colors_and_type.css   ← augmented tokens + semantic type classes (Inter substituted for Geist)

assets/
  logo-dark.svg       ← wordmark on light bg
  logo-white.svg      ← wordmark on dark bg

preview/              ← cards registered in the Design System tab
  colors-brand.html
  colors-status.html
  colors-surfaces.html
  colors-text.html
  type-display.html
  type-scale.html
  type-mono.html
  spacing.html
  radii.html
  shadows.html
  buttons.html
  badges-chips.html
  inputs.html
  cards.html
  alerts.html
  table.html
  logo.html
  icons.html

ui_kits/
  admin-spa/
    README.md
    index.html        ← interactive click-thru of the admin SPA
    components.jsx    ← JSX components (Sidebar, Topbar, Button, Badge, ...)
    screens.jsx       ← screen compositions (Login, Systems, Roles, Users)
```

---

## Caveats

- **Brand font is Geist**, loaded locally from `fonts/Geist-VariableFont_wght.ttf` (variable 100–900). Inter is kept as a fallback. Both fonts are wired in `colors_and_type.css`.
- **No Figma, no screenshots of the live product.** The UI kit is reconstructed from the documented components in the identity spec, not from production screens. Treat the kit as a faithful *materialization* of the spec, not a pixel-perfect replica of a running app.
- **Portuguese (pt-BR) copy throughout**, matching the source.
