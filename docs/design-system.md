# Wakil Design System (M1)

**Status:** Approved for M1 implementation. Tokens are implemented once in
`packages/ui/src/styles/tokens.css` and consumed as semantic tokens only. Screens and components
must not hard-code raw values.

## 1. Visual direction

Wakil is a calm, premium, unmistakably mobile Arabic product for the Gulf. The interface is a quiet
dark room where the user's own words are the brightest thing on screen.

- **Arabic leads.** Cairo typography, RTL-first layout, Gulf-friendly copy. Latin/code/IDs are
  isolated guests, not the default.
- **Dark layered surfaces.** Depth comes from stepped surface tones and hairline borders, not heavy
  shadows or glass.
- **One restrained accent.** A violet primary accent is used for the single most important action or
  state per screen. Cyan appears only to mark meaningful status (connectivity, info), never as
  decoration.
- **Tactile, honest controls.** Big touch targets, visible pressed states, real product states.
  Nothing animates without a reason; nothing pretends work is happening.
- **Signature:** the request composer is the hero of the product. On `/new` it is the largest,
  warmest element on screen — the one place the accent is spent generously.

**Avoid:** gradient washes, glassmorphism panels, neon glows, decorative blobs, identical rounded
card grids, oversized empty heroes, fake metrics or activity, page-specific one-off styles.

## 2. Primitive tokens

### 2.1 Color primitives (dark theme, the M1 default and only theme)

| Token             | Value     | Notes                                  |
| ----------------- | --------- | -------------------------------------- |
| `--wk-neutral-0`  | `#0E0E15` | Deepest page background (violet-cast)  |
| `--wk-neutral-1`  | `#15151E` | Raised surface                         |
| `--wk-neutral-2`  | `#1C1C27` | Card / list surface                    |
| `--wk-neutral-3`  | `#242431` | Overlay, menu, pressed surface         |
| `--wk-neutral-4`  | `#2C2C3B` | Hairline borders, dividers             |
| `--wk-neutral-5`  | `#3B3B4E` | Strong borders, disabled fill          |
| `--wk-neutral-6`  | `#6E6E84` | Input borders (≥3:1 non-text contrast) |
| `--wk-white`      | `#F2F2F7` | Highest-emphasis text                  |
| `--wk-gray-300`   | `#B4B4C4` | Secondary text                         |
| `--wk-gray-500`   | `#8A8A9E` | Tertiary text (large sizes only)       |
| `--wk-violet-300` | `#B6A6FF` | Accent text / links / focus on dark    |
| `--wk-violet-500` | `#7050EE` | Primary action fill                    |
| `--wk-violet-600` | `#6B4BE0` | Primary action hover                   |
| `--wk-violet-700` | `#5B3FD1` | Primary action pressed                 |
| `--wk-violet-900` | `#2A2148` | Accent-tinted subtle fill              |
| `--wk-cyan-300`   | `#67E8F9` | Status/info text only                  |
| `--wk-cyan-900`   | `#123B44` | Status/info subtle fill                |
| `--wk-green-300`  | `#6EE7A0` | Success text                           |
| `--wk-green-900`  | `#12351F` | Success subtle fill                    |
| `--wk-amber-300`  | `#FCD34D` | Warning text                           |
| `--wk-amber-900`  | `#3B2E10` | Warning subtle fill                    |
| `--wk-red-300`    | `#FCA5A5` | Danger text                            |
| `--wk-red-500`    | `#D02B31` | Danger action fill                     |
| `--wk-red-900`    | `#3C1618` | Danger subtle fill                     |

Contrast (computed with the WCAG relative-luminance formula):

- `--wk-white` on `--wk-neutral-0/1/2` ≥ 13:1.
- `--wk-gray-300` on `--wk-neutral-0` = 9.40:1, on `--wk-neutral-2` = 8.25:1 (body-safe).
- `--wk-gray-500` on `--wk-neutral-0` = 5.68:1; on `--wk-neutral-2` cards = 4.99:1 — keep tertiary
  text off dense card surfaces below 14px.
- White on `--wk-violet-500` = 5.16:1; white on `--wk-violet-600` = 5.66:1; white on `--wk-red-500`
  = 5.16:1 (AA for button labels). Do not lighten these fills — the ratios are threshold-critical by
  design.
- `--wk-violet-300` on `--wk-neutral-0` = 9.05:1; `--wk-cyan-300` = 13.26:1; status text on its
  subtle fill ≥ 8:1 for all four status pairs.
- `--wk-neutral-6` input border on `--wk-neutral-1` fill = 3.65:1 (WCAG 1.4.11 non-text ≥ 3:1).
- Disabled text (`--wk-gray-500` on `--wk-neutral-5` = 3.23:1) is intentionally low-contrast and
  exempt under WCAG 1.4.3 (disabled controls); disabled controls also set `aria-disabled`.

### 2.2 Typography primitives

Cairo, self-hosted WOFF2 (SIL OFL license committed beside the fonts). No runtime font requests.

| Token            | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| `--wk-font-sans` | `"Cairo", system-ui, sans-serif`                             |
| `--wk-font-mono` | `ui-monospace, "Cascadia Mono", monospace` (IDs, code, URLs) |
| Weights          | 500 (body), 600 (labels/emphasis), 700 (headings)            |

Type scale (rem, base 16px):

| Token            | Size / line-height | Use                          |
| ---------------- | ------------------ | ---------------------------- |
| `--wk-text-xs`   | 12px / 1.5         | Meta, timestamps (600)       |
| `--wk-text-sm`   | 14px / 1.6         | Secondary text, labels       |
| `--wk-text-base` | 16px / 1.7         | Body (Cairo 500)             |
| `--wk-text-lg`   | 18px / 1.6         | Emphasized body, list titles |
| `--wk-text-xl`   | 20px / 1.5         | Section headings (700)       |
| `--wk-text-2xl`  | 24px / 1.4         | Page headings (700)          |
| `--wk-text-3xl`  | 30px / 1.3         | Hero heading on /new only    |

Arabic body is never below 14px; form inputs are 16px to prevent iOS zoom. Numerals use Western
Arabic digits (0-9) product-wide — format dates and counts with the `ar-u-nu-latn` locale — so
numbers, IDs, and technical tokens render consistently; identifiers, URLs, emails, and code always
sit inside an LTR-isolated span. Inline numbers in Arabic sentences do not need the LTR wrapper;
multi-part tokens (IDs, phone numbers, URLs) do.

### 2.3 Spacing, radius, borders

- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 — logical properties only
  (`margin-inline-start`, `padding-inline`, …).
- Radius: `--wk-radius-sm: 6px` (inputs, chips), `--wk-radius-md: 8px` (cards, dialogs, buttons —
  cards never exceed 8px), `--wk-radius-full: 9999px` (avatars, status dots).
- Borders: 1px hairline `--wk-neutral-4`; strong 1px `--wk-neutral-5`. No 2px+ decorative borders.

### 2.4 Elevation

Dark-theme elevation = lighter surface + hairline border + soft shadow. Three steps only:

| Token            | Composition                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `--wk-elevate-0` | surface-1, border neutral-4, no shadow                                       |
| `--wk-elevate-1` | surface-2, border neutral-4, `0 1px 2px rgb(0 0 0 / 0.3)`                    |
| `--wk-elevate-2` | surface-3, border neutral-5, `0 8px 24px rgb(0 0 0 / 0.45)` (dialogs, menus) |

Overlay scrim: `rgb(8 8 12 / 0.6)`.

## 3. Semantic tokens

| Semantic token             | Maps to                                     |
| -------------------------- | ------------------------------------------- |
| `--wk-bg-page`             | neutral-0                                   |
| `--wk-bg-raised`           | neutral-1                                   |
| `--wk-bg-card`             | neutral-2                                   |
| `--wk-bg-overlay`          | neutral-3                                   |
| `--wk-bg-accent`           | violet-500                                  |
| `--wk-bg-accent-hover`     | violet-600                                  |
| `--wk-bg-accent-pressed`   | violet-700                                  |
| `--wk-bg-accent-subtle`    | violet-900                                  |
| `--wk-bg-selected`         | violet-900 (violet-300 text on it = 7.01:1) |
| `--wk-bg-input`            | neutral-1                                   |
| `--wk-bg-secondary-action` | neutral-3                                   |
| `--wk-bg-disabled`         | neutral-5                                   |
| `--wk-text-disabled`       | gray-500                                    |
| `--wk-bg-danger`           | red-500                                     |
| `--wk-bg-danger-subtle`    | red-900                                     |
| `--wk-bg-info-subtle`      | cyan-900                                    |
| `--wk-bg-success-subtle`   | green-900                                   |
| `--wk-bg-warning-subtle`   | amber-900                                   |
| `--wk-text-primary`        | white                                       |
| `--wk-text-secondary`      | gray-300                                    |
| `--wk-text-tertiary`       | gray-500                                    |
| `--wk-text-accent`         | violet-300                                  |
| `--wk-text-info`           | cyan-300                                    |
| `--wk-text-success`        | green-300                                   |
| `--wk-text-warning`        | amber-300                                   |
| `--wk-text-danger`         | red-300                                     |
| `--wk-text-on-accent`      | `#FFFFFF`                                   |
| `--wk-border-subtle`       | neutral-4                                   |
| `--wk-border-strong`       | neutral-5                                   |
| `--wk-border-input`        | neutral-6                                   |
| `--wk-focus-ring`          | violet-300                                  |

`--wk-text-on-accent` is pure `#FFFFFF` intentionally (maximum punch on action fills) while
`--wk-white` is the softer `#F2F2F7` for long-form text — do not unify them.

Z-index scale (the only allowed stacking values): `--wk-z-nav: 20` (header, bottom nav, composer),
`--wk-z-banner: 30` (status banner), `--wk-z-overlay: 40` (scrim, dialog, menu), `--wk-z-toast: 50`.

Elevation "tokens" (§2.4) are composites of surface + border + shadow; they ship as utility classes
in `packages/ui`, not as single CSS variables.

Status colors always pair with an icon or text — color is never the only signal.

## 4. Component tokens and rules

- **Buttons:** height 48px (default) / 44px (compact minimum), radius 8px, Cairo 600. Variants:
  `primary` (`--wk-bg-accent` fill, `--wk-text-on-accent`), `secondary` (`--wk-bg-secondary-action`
  fill, primary text), `ghost` (transparent, secondary text), `danger` (`--wk-bg-danger` fill, white
  text). Hover = `--wk-bg-accent-hover` (or a one-step-lighter surface for secondary/ghost); pressed
  = `--wk-bg-accent-pressed` + scale 0.98 (scale disabled under reduced motion); disabled =
  `--wk-bg-disabled` fill + `--wk-text-disabled` + `aria-disabled`. Loading = inline spinner +
  disabled; the label remains.
- **Icon buttons:** 44×44px minimum, accessible name required.
- **Inputs / textarea / search:** min-height 48px, 16px text, `--wk-bg-input` fill,
  `--wk-border-input` border (≥3:1 against the fill so the field boundary is perceivable), focus =
  2px focus-ring outline with 2px offset; error = danger border + error text under the field,
  `aria-describedby` wired.
- **Cards / list items:** surface-2, radius 8px, 16px padding, whole row is one ≥44px target.
- **Dialogs / confirmation:** elevate-2, radius 8px, max-width 400px, centered; labelled by their
  heading; focus is trapped inside while open and returns to the trigger on close (Radix defaults);
  scrim click and explicit close both dismiss, and dismissal always means _cancel_ — never confirm —
  for destructive dialogs. Destructive confirmation uses the danger button plus a plain-language
  Arabic consequence sentence.
- **Toast:** elevate-2 surface, radius 8px, fixed above the bottom nav / composer (`--wk-z-toast`),
  max-width 360px, auto-dismisses in 4s, `aria-live="polite"` so it never steals focus; slide+fade
  entry (instant under reduced motion). One toast at a time.
- **Bottom navigation:** 4 items (إنشاء، المشاريع، الاستخدام، الحساب), icon + label, active = accent
  text + 2px top indicator, height 56px + safe-area padding, never overlays content (content
  reserves its height).
- **App header:** 56px, page title (Cairo 700 20px), back button flips for RTL.
- **Composer (the signature element):** an accent-tinted raised field — `--wk-bg-accent-subtle`
  surface with an `--wk-border-input` border that warms to `--wk-focus-ring` on focus, radius 8px,
  generous 16px padding, auto-growing textarea up to 6 lines then inner scroll. The send button is
  the primary accent fill. It sits fixed above the bottom nav within the safe area and never covers
  the newest message (the scroll container reserves its height). Keyboard strategy: the viewport
  meta uses `interactive-widget=resizes-content` so the mobile keyboard resizes the layout and the
  composer stays attached above it; the bottom nav remains in place (no visualViewport scripting in
  M1). This is the one place the accent is spent generously; on `/new` it is the visual hero of the
  product.
- **Skeletons:** surface-3 blocks, subtle opacity pulse (disabled under reduced motion), only while
  a real request is in flight.
- **Empty / error states:** icon + one-line Arabic explanation + one action. Errors state the cause
  and the fix; no apology filler, no technical leakage.
- **Status banner:** info (cyan), warning (amber), danger (red) — subtle fill + status text + icon,
  used for offline/reconnecting and form-level errors.

## 5. Icons

Lucide icons only, 24px default (20px in dense rows), stroke 2, `currentColor`. Directional icons
(chevrons, arrows, send) must flip in RTL via logical rendering or explicit `rtl:` flip. No emoji as
UI icons.

## 6. Focus, keyboard, touch

- Visible focus: 2px `--wk-focus-ring` outline, 2px offset, on every interactive element — never
  removed, `:focus-visible` based. The ring offset must land on a non-accent background; do not
  place primary buttons directly on `--wk-bg-accent-subtle` without extra spacing.
- Touch targets ≥ 44×44px with ≥ 8px gaps; whole-row targets for list items.
- No hover-only affordances; hover is an enhancement of an always-visible control.
- `touch-action: manipulation` on interactive elements.

## 7. Motion

- Micro-interactions 150–250ms; enter `ease-out`, exit `ease-in` (~70% of enter duration).
- Motion only explains state: dialog scale+fade from 0.96, banner slide-in, pressed scale.
- No ambient/looping decoration. Spinners appear only during real pending work.
- `prefers-reduced-motion: reduce` disables all non-essential transitions and the pressed scale;
  state changes become instant. This is implemented globally in the token stylesheet.

## 8. RTL rules

- `<html lang="ar" dir="rtl">` is the root; all layout uses logical CSS properties.
- Code, URLs, IDs, emails, and numbers that require it are wrapped in a `dir="ltr"` isolating span
  (`unicode-bidi: isolate`) — provided by the `Ltr` UI helper.
- Navigation order, tabs, chevrons, drawers, and animations follow RTL reading order.
- Never mirror: brand marks, media controls, clocks.

## 9. Responsive and safe areas

- Mobile-first. Acceptance viewports: 390×844 and 430×932. Content column max-width 640px, centered
  on larger screens; desktop enhances spacing only — it never introduces a different layout system,
  hover-only features, or dense tables.
- `viewport-fit=cover`; header, bottom nav, composer, and dialogs respect `env(safe-area-inset-*)`.
- `min-height: 100dvh` (never `100vh`) for full-height shells.
- No horizontal overflow at any acceptance viewport; long Arabic strings wrap, never clip; long LTR
  tokens use `overflow-wrap:anywhere` inside their isolation span.

## 10. Voice and copy

- Simple Gulf-friendly Arabic, sentence-length lines, no jargon; technical detail hidden behind
  progressive disclosure.
- Actions keep the same name across the flow (زر «إنشاء المشروع» → توست «تم إنشاء المشروع»).
- Errors: what happened + what to do, in the product's voice («تعذّر حفظ الطلب. تحقق من الاتصال ثم
  أعد المحاولة.»). Never SQL, stack traces, or provider names.
- Empty states invite the first action; they never show fake examples or metrics.
