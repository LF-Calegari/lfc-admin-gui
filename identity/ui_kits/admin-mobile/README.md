# admin-mobile UI kit

Mobile companion to `admin-spa`. Touch-first recreation of the admin panel — drawer nav, bottom tab bar, bottom-sheet action menus, FAB, 44px+ hit targets throughout.

Built with the `ios_frame` starter component so each screen renders inside a realistic iPhone bezel with status bar. Three devices side-by-side in `index.html` show: **list** → **detail** → **actions**.

**Screens:** Systems (list + detail), Users (+ action sheet), Roles, Permissions, Tokens, Settings. Drawer nav covers everything.

**Files:**
- `index.html` — stage hosting 3 iOS devices
- `ios-frame.jsx` — iPhone bezel / status bar (starter component)
- `mobile-screens.jsx` — `MobileApp`, all screens, drawer, sheet, FAB, toast
- `mobile.css` — mobile-specific tokens (44px targets, bottom sheet, drawer, tab bar)

All token vars come from the root `colors_and_type.css` — same brand, scaled for touch.
