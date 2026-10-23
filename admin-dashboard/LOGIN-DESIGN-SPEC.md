# Login page design spec — reference layout

> Source of truth for the measurements: `https://dashboard.chapa.global/` (captured 2026-10-23).
> **Branding note:** per project-owner request, all vendor branding (wordmark,
> headline mentions, watermark in the background asset, page copy) was replaced
> with **FreeGateway** branding after capture. Layout, tokens, and assets are
 otherwise untouched; the background image was patched to remove the vendor
 watermark.

## App-wide design system

On the same request the tokens were extended to the **entire admin console**
(all `(dashboard)` routes + this login page), driven by the measured theme +
status badge palette captured from the reference (the vendor's authenticated
dashboard itself is inaccessible, so dashboard *layout* was not copied — only
the measured tokens were applied to the existing app structure):

- Tokens in `src/app/login/theme.css`: full badge palette
  (`badge-success/pending/failed/cancelled/blocked/auth-needed/incomplete/
  partial-refund/fully-refunded/otp-required/processing` + foregrounds),
  `misc-danger*`, `dark-green`, `progress-bar`, and `shadow-card
  (0 4px 33.1px #0000000d)`; plus the `card` utility (white, 1px
  `gray-border`, radius 16px) shared by all dashboard panels.
- Fonts/background applied globally in `src/app/layout.tsx`
  (`font-primary bg-background`); page headings use the measured `text-h1`
  (30px/36px, 600).
- Shell: light 284px sidebar (`--width-sidebar`), white topbar, `#f4f5f9`
  content; nav hover/active `nav-hover #f0fde3` with `primary` accents.
- Statuses/methods/roles/audit actions colored from the badge palette via the
  maps in `src/lib/ui.ts`.
- Primary actions are `bg-primary` buttons; danger actions
  `badge-failed/-blocked` foregrounds; alerts are `badge-*` tinted banners.

Measured live (Playwright, 1440×900 / 768×1024 / 390×844) and from the served CSS/Tailwind theme.
Reference layout: server-rendered two-panel card centered in a full-height light-gray page.

## Page layout

| Element | Value |
|---|---|
| Page wrapper | flex center, min-h-screen, overflow-hidden, `bg #f4f5f9`; padding 40px (<lg), 16px (<md) |
| Card | max-width 960px, radius 16px, white, `shadow-xl` (0 20px 25px -5px / 10%, 0 8px 10px -6px / 10%), row ≥lg |
| Left panel | 47% (measured 451px), dark image bg (`/images/login-background.png`, object-cover), under: `#0d1b34`-ish slate |
| Right panel | 53% (measured 509px), white, `px-6 py-8`, top 80px ≥md, bottom 40px ≥lg, form column max-w 327px |

## Left panel (brand)

| Element | Value |
|---|---|
| Content padding | px-6 py-6 (<md); lg: px-8, pt-88px, pb-88px |
| Logo | `/images/chapa-logo.svg`, intrinsic 1133×263 ∈ rendered 165×38 |
| H1 "Start closing more deals with Chapa" | 30px/36px, weight 600, white, mt 32, mb 12 (≥md); 18px/28px mobile, centered |
| Feature rows (≥lg only) | 40px circle `rgba(125,196,0,0.2)`, lucide icon 20px `#7dc400` (users / handshake / circle-check-big), text 12px/19.2px `rgba(255,255,255,0.8)`, rows 12px apart, dashed Line.png (379×1) w-full h-16px between |
| Copyright | 12px, white ≥md / gray-secondary below, absolute bottom 24px centered ≥lg |

## Right panel (form)

| Element | Value |
|---|---|
| H2 "Welcome Back" | 24px/32px bold `#101828` (20px/28px mobile), mb 12 (24 mobile) |
| Subtitle | 12px `#8792a3` |
| Input | 327×54, radius 12px, border 1px `#e4e8ed`, hover `#99a1af`, focus-border `#7dc400`, pt 24 pb 8, pl 64 (pr 64 password), font 12px/500 `#000`, placeholder `#8792a3` |
| Floating label | 10px `#99a1af`, top 12px, left 64px, red `*` suffix; icon 20px `#4a5565` at left 16, divider 1×32px `#e5e7eb` at left-rem-12 |
| Eye toggle | 20px `#6a7282`, right 16px, centered |
| Checkbox row | checkbox 16×16 r4 `#d1d5db`, label 12px/500 `#8792a3`; "Forgot Password ?" 12px/500 `#7dc400` with 2px underline sweep |
| Login button | full-width 327×40, r4, `#7dc400` shadow-xs, text 12px/600 white; disabled `#d9d9d9`; hover shimmer sweep 700ms |
| Divider | `or` 12px `#8792a3` on white px-2 over `#e4e8ed` line |
| Google button | 327×36, r4, white bg, shadow `0 6px 40px rgba(214,217,224,0.5)`, icon 20px, text 12px/500 `#000`, tracking 0.3px |
| Footer | "Don't have an account?" 12px `#8792a3`; "Sign up" 12px/500 `#7dc400` underline sweep |

## Design tokens (Tailwind v4 `@theme`)

```
--font-primary: "Inter Tight", "Inter Tight Fallback", sans-serif   (variable, 100–900 woff2)
--color-background            #f4f5f9
--color-foreground            #000000
--color-primary               #7dc400
--color-primary-alt           #7dc242
--color-secondary             #0d1b34
--color-gray-primary          #59647a
--color-gray-secondary        #8792a3
--color-gray-border           #e4e8ed
--color-gray-background       #f4f5f9
--color-gray-disabled         #ccd0da
--color-button-disabled       #d9d9d9
--color-nav-hover             #f0fde3
--color-blue-dark             #0f2840
Typography: 2xs 10px, xs 12px, sm 14px, base 16, xl 20, 2xl 24, 3xl 30(line 40)/2(30→36 h1 uses md:text-3xl)
Utility classes: text-h1..l1/2/btn — sizes+line-heights as above (see theme.css)
shadow-elevated: 0 6px 40px rgba(214,217,224,0.5)
```

## Reusable components extracted

- `BrandLogo` (inline "FG" monogram + FreeGateway wordmark, drops into the same 165×38 slot)
- `PanelShell` (login page only — split card), part of page markup
- `FloatingField` (icon + divider + floating label + input + optional trailing button)
- `ChapaButton` variants (primary w/ shimmer, ghost-elevated) — inlined in form; shared CSS via `bg-primary` etc.

## Responsive behavior

- `<1024` (lg): card is column; features hidden; copyright flows after H1; page padding 40
- `<768` (md): everything center-aligned on left panel; H1 18px; welcome 20px; forgot/checkbox stack; page padding 16
- `<640`: search/inputs full width (form column max 327px everywhere ≥sm)

## Deliberate local adaptations (preserving local behavior)

- Cloudflare Turnstile box (65px) omitted — no Turnstile site key locally; Login is enabled without it
- Google button rendered but responds with an inline notice (no Google OAuth in this gateway)
- "Forgot Password ?" responds with an inline notice (no password-reset flow; self-service via My account)
- "Phone Number / Email" input sends its value as the existing `email` credential of `/api/auth/login`
- "Keep me signed in for 7 days" now extends the session TTL to 168h (previously hardcoded TTL)
- Inter Tight fonts + logo/background/line/google assets initially copied from the reference (`/public/brand/`, `/src/app/fonts/`); the vendor wordmark and its watermark were later removed per the project owner
