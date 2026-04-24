# admin-spa UI kit

Interactive recreation of the **lfc-admin-gui** admin SPA.

Built from the documented components in the identity spec — sidebar nav, topbar, buttons, badges, permission chips, inputs, cards, tables, alerts. Screens reconstructed from the domain vocabulary in the source (Systems / Roles / Users / Permissions / Tokens), since no screenshots of the running product were available.

**Entry point:** `index.html` — click-thru prototype. Start at login, land in Systems, explore Roles and Users. Everything is fake data; destructive buttons confirm in-place.

**Files:**
- `index.html` — shell that mounts all screens
- `components.jsx` — atoms: `Button`, `Badge`, `PermChip`, `Input`, `Card`, `Alert`, `Icon`
- `layout.jsx` — `Sidebar`, `Topbar`, `PageHeader`
- `screens.jsx` — `LoginScreen`, `SystemsScreen`, `RolesScreen`, `UsersScreen`, `PermissionsScreen`

All components read CSS vars from the project-root `tokens.css` / `colors_and_type.css`. Copy those files plus `assets/` when extracting.
