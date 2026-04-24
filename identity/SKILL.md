---
name: lfc-authenticator-design
description: Use this skill to generate well-branded interfaces and assets for LFC Authenticator (lfc-admin-gui), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files. The key entry points are:

- `README.md` — full brand guide (content tone, visual foundations, iconography)
- `colors_and_type.css` — drop-in tokens + semantic type classes
- `tokens.css` — original design token file (verbose, fully-commented)
- `assets/` — brand logos as SVG
- `preview/` — small HTML cards documenting each atom of the system
- `ui_kits/admin-spa/` — interactive recreation of the admin SPA with reusable JSX components

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. Link `colors_and_type.css` (or inline the `:root` block from `tokens.css`) to get the full palette + typography.

If working on production code, copy assets and read the rules in `README.md` to become an expert in designing with this brand. The token file is already production-ready.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions (mobile vs desktop, light vs dark, which domain object — systems / roles / users / permissions), and act as an expert designer who outputs HTML artifacts *or* production code, depending on the need.

**Brand in one line:** a secure-terminal aesthetic — green on sage-cream, Inter + JetBrains Mono, precise voice, zero decoration.
