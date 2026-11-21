# Design Language: Lane Lines

3 Feet Please's visual language takes its cues from road markings, race bibs, and bike-poster
typography. Pages should look like a well-painted street: bold, flat, and easy to read at speed.

Reference implementations: [`src/routes/+page.svelte`](../src/routes/+page.svelte) (homepage) and
[`src/routes/admin/workspace/+page.svelte`](../src/routes/admin/workspace/+page.svelte) (tool pages).

## Principles

1. **Flat color fields, not containers.** Sections run full-width and edge to edge. Separate
   them with color, hairlines, and whitespace, never with a card inside another card.
2. **Square edges.** Do not round buttons, images, tags, or sections. The only shapes are
   rectangles and stripes.
3. **Loud type, quiet body.** Headlines are huge, uppercase, italic, and black weight. Body copy
   stays plain, medium-weight, and readable.
4. **Saturated, not translucent.** Use solid theme colors at full strength. Avoid glass,
   blur, gradient overlays, and low-opacity panels behind text.
5. **The 3-foot measure is the signature.** Ruler ticks, lane dashes, and the "3FT" mark tie
   every page back to the mission.

## Color

| Role      | Token           | Feel           | Text on it                          |
| --------- | --------------- | -------------- | ----------------------------------- |
| Primary   | `primary-500`   | Lemon / hi-vis | `surface-950`                       |
| Secondary | `secondary-500` | Deep violet    | `surface-50`, accents `primary-500` |
| Tertiary  | `tertiary-500`  | Hot magenta    | `surface-950`                       |
| Ground    | `surface-950`   | Asphalt        | `surface-50`, muted `surface-300`   |
| Hairlines | `surface-800`   | Road seams     | n/a                                 |

- Alternate fields so neighbouring sections never share a color, e.g.
  lemon → violet → asphalt → magenta → asphalt → triptych.
- Use accents sparingly within a field: numerals in magenta on asphalt, a highlighted phrase
  in violet on lemon, weekday in lemon on violet.
- Never put white text on lemon or lemon on magenta.

### Contrast

Measured against the palette. WCAG AA needs 4.5:1 for text, and 3:1 for large text and control borders.

| Pair                                            | Ratio       | Rule                                         |
| ----------------------------------------------- | ----------- | -------------------------------------------- |
| `surface-950` text on lemon                     | 17.6        | OK                                           |
| `surface-950` text on success / warning         | 11.8 / 10.8 | OK                                           |
| `surface-950` text on magenta                   | 5.0         | OK                                           |
| `surface-950` text on `error-500`               | 5.0         | Use this. White on `error-500` is 3.8, fails |
| `surface-50` text on violet                     | 7.1         | OK                                           |
| `surface-300` text on 950 / 900                 | 7.5 / 6.3   | Muted text                                   |
| `surface-400` text on 950 / 900                 | 5.1 / 4.3   | Fails on 900. Use on 950 only, or large bold |
| `tertiary-500` or `error-500` text on 950 / 900 | 5.0 / 4.2   | On 900 only as large bold text               |
| `surface-500` border on 950 / 900               | 3.3 / 2.8   | Smallest border for a control on asphalt     |
| `surface-700` border on 950                     | 1.9         | Hairlines only. Too faint for a control      |

## Typography

System font stack (`system-ui`), styled with these utility recipes:

| Use            | Classes                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Display (h1)   | `text-[clamp(2.9rem,7.4vw,7rem)] leading-[0.86] font-black tracking-[-0.04em] uppercase italic` |
| Section (h2)   | `text-4xl sm:text-6xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic`            |
| Sub-head (h3)  | `text-2xl sm:text-3xl font-black uppercase`                                                     |
| Eyebrow        | `text-xs font-bold tracking-[0.22em] uppercase` (often `text-primary-500` on dark)              |
| Lead           | `text-lg sm:text-2xl leading-snug font-medium`                                                  |
| Index numerals | `font-black italic tabular-nums text-tertiary-500` (`01`, `02`, …)                              |

> [!IMPORTANT]
> `app.css` forces a color on `.app-shell h1–h6`. Set heading colors with the important
> modifier, e.g. `text-surface-950!` or `text-surface-50!`.

A heading inside a link that recolors on hover needs `text-inherit!`, or it keeps its own
color. A section that is always on asphalt can set heading color once in its layout instead of
marking every heading (`src/routes/admin/+layout.svelte` does).

## Components

**Buttons**: rectangular, uppercase, `font-black`, generous padding (`px-7 py-4`).

- Solid: `bg-surface-950 text-primary-500` on light fields; `bg-primary-500 text-surface-950`
  on dark fields.
- Outline: `border-[3px] border-surface-950` (or `border-surface-50` on dark), filling solid on hover.
- Trailing arrow nudges right on hover (`group-hover:translate-x-1`).

In dense tool UI, Skeleton presets are fine: `btn preset-filled-primary-500` and
`btn preset-outlined-surface-500` (`app.css` already makes buttons square, uppercase, and
black-on-lemon). Keep the full utility recipe for hero and call-to-action buttons, and add
`px-7 py-4` to the one primary action on a page.

**Tags**: a flat block pinned to an edge, e.g. `absolute top-0 left-0 bg-primary-500 px-4 py-2`
with eyebrow text. Used for "Next up near you", "Riding with".

**Lists**: rows divided by `border-b border-surface-800` under a heavy `border-t-2` rule.
Each row has an index numeral, a square logo tile (`bg-surface-50`), a title, meta text,
and an arrow. Hover turns the whole row into a color field (`hover:bg-primary-500
hover:text-surface-950`).

**Action triptych**: three sibling tiles in primary / secondary / tertiary, each one big link
with an icon, an up-right arrow, and an uppercase italic title.

**Form controls**: on asphalt, fields are `bg-surface-950 border-2 border-surface-500 text-surface-50`
with a `primary-500` border on focus, and placeholders are `surface-400`. Labels are small eyebrows
in `surface-300` (`text-xs font-bold tracking-[0.18em] uppercase`). The Tailwind Forms plugin draws a
white check, so a checked box takes a dark fill (violet), never lemon.

**Status**: a status is a flat solid field with `surface-950` text: mint for success, amber for
warning, red for error. Banners are whole blocks, counts and states are tags, and markers are small
squares, never pills or dots. Fill one status at a time: a filter band fills only the active status
and the others keep a square marker.

**Panels**: a sidebar or callout is `bg-surface-900` with a `border-t-4` accent: violet for a list or
sidebar, red for a danger zone, lemon for a dialog. What it controls sits on the asphalt ground, not
in a second panel.

**Tabs**: buttons on a `border-b-2` hairline. The active tab is lemon with a `border-b-4` underline.
Mark tabs and toggle tiles with `aria-pressed`.

**Tile grids**: separate tiles with hairlines, not gaps or cards. Wrap the grid in `overflow-hidden`,
give the grid `-ml-0.5`, and give each tile `border-b-2 border-l-2 border-surface-800`. A partial last
row stays clean.

**Dialogs**: use a native `<dialog>` opened with `showModal()`, which gives an inert background, Escape
to close, and focus restore. Style the panel flat with `border-t-4 border-primary-500` and
`backdrop:bg-surface-950/80`. Add `m-auto` (Tailwind's reset zeroes the margin that centers it) and
`open:flex` (so a closed dialog stays hidden). Never call `showModal()` on an element that can be
`display: none`: the page behind it goes inert.

**Previews of things that are not app UI** (a generated email, for example) keep their real look.
Wrap them in `.keep-radius`, which `app.css` exempts from the square-edge rule, on a white canvas.
Put dark-on-transparent artwork on `bg-surface-50` tiles.

## Motifs

- **Vertical ruler**: magenta strip with "3FT … 0" and ticks via
  `bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)]`.
- **Horizontal ruler band**: `grid-cols-3` with heavy borders, ticks, and labels 0 / 1 ft /
  2 ft / 3 ft.
- **Lane divider**: `h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]`.
- **Outlined numeral**: `text-transparent [-webkit-text-stroke:3px_var(--color-surface-950)]`.
- **Ticker**: violet band of lemon slogans separated by magenta `✺`. Animated only under
  `prefers-reduced-motion: no-preference`; marked `aria-hidden`.

## Layout

- Pages inside the app shell cancel the `main` padding with `-m-4` to go full-bleed.
- Inner padding: `px-6 sm:px-10 lg:px-14`, vertical `py-12 lg:py-16` (safety-style sections up to `lg:py-20`).
- Split sections use asymmetric grids (`lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]`).
- Stack vertical rhythm with `flex flex-col gap-*`. Children often carry `m-0`, which
  cancels `space-y-*`.
- Size full-height shells with `min-h-[calc(100dvh-var(--app-header-height))]` and pin sheets with
  `top-[var(--app-header-height)]`. The sticky header is `z-60`, so anything pinned higher is covered.

## Do / Don't

| Do                                        | Don't                                     |
| ----------------------------------------- | ----------------------------------------- |
| Full-bleed color sections                 | Cards nested in cards or panels           |
| Square corners everywhere                 | `rounded-*`, pill buttons                 |
| Solid saturated fields                    | Glassmorphism, blur, translucent overlays |
| Hairlines and color changes to separate   | Drop shadows to separate                  |
| One bold accent per field                 | All three accents fighting in one block   |
| Motion gated by reduced-motion preference | Always-on animation                       |

## Accessibility

- Keep body text at full contrast on its field; use `surface-300` for muted text on asphalt only.
- Decorative motifs (rulers, ticker, giant "3FT") are `aria-hidden`.
- Every section has an `aria-labelledby` heading; link targets stay large (full rows/tiles).
- Gate every spinner and pulse behind `motion-safe:`.
- Label icon-only buttons, and give repeated controls distinct names ("Open Group Name", not "Open").

## Skeleton Presets on Asphalt

The asphalt ground does not follow the light/dark theme, so a preset that does will break on it:

- Avoid `preset-tonal-*`. It is a light/dark pair (`surface-50-950`, `warning-50-950`, ...) and turns
  light on asphalt in the light theme. Use `preset-filled-*-500` or `preset-outlined-*-500`. (`app.css`
  already turns tonal primary, secondary, and tertiary into solid fields.)
- `preset-outlined-*` sets only a 1px border and no text color. Set both, as
  `src/routes/admin/+layout.svelte` does (2px border, light text).
- Check that a preset exists before using it. `preset-outlined-warning` does not (it needs `-500`),
  and an unknown class silently does nothing.
- Filled error buttons are white on red (3.8:1) by default. Set
  `--color-error-contrast-500: var(--color-surface-950)` on the page or layout, as admin does.

## Shell & Site-wide Rollout

- **App shell (`src/routes/+layout.svelte`)**:
  - The sticky top header bar uses `bg-surface-950/78 backdrop-blur-xl border-b border-primary-500/25` so it preserves blurred glass translucency while maintaining enough dark surface density for white text (`3 Feet Please`, controls) to stay 100% readable when scrolling over bright yellow, violet, magenta, or photographic sections.
  - The left navigation rail (`bg-surface-50-950/42` with rounded nav pills) remains translucent over the ambient radial-gradient body background.
- **Hierarchy between Homepage and Secondary Landing Pages**:
  - **Homepage (`src/routes/+page.svelte`)**: The bold centerpiece. Uses full-bleed saturated color fields (`bg-primary-500`, `bg-secondary-500`, `bg-tertiary-500`), oversized display headlines (`clamp(2.9rem, 7.4vw, 7rem)`), the 64px vertical `3FT` ruler, and full-row color-field hovers.
  - **Secondary Landing & Directory Pages (`/groups`, `/ride`, `/learn`, `/volunteer`, `/merch`, `/donate`, `/get-involved`, `/profile`)**: Grounded on dark asphalt (`bg-surface-950` and `bg-surface-900`) so they belong to the boxy 90s "Lane Lines" family without competing with the homepage or overwhelming directory browsing:
    - Compact split hero (`bg-surface-950 border-b-2 border-surface-800`) with a `border-l-4 border-primary-500` left accent stripe, `text-3xl sm:text-5xl` uppercase italic headline, inline stats, and a slim `w-2 bg-tertiary-500` stripe on the photo/stat column.
    - Compact search & filter toolbar (`bg-surface-900 border-b-2 border-surface-800 px-6 py-5`) without a redundant secondary billboard heading, keeping directory listings visible above the fold.
    - Sidebars and callout panels use `bg-surface-900` with `border-t-4 border-secondary-500` or `border-t-4 border-tertiary-500` top accent bars rather than solid full-column neon fills.
- **Microsites (`[siteSlug]`)**: Scoped outside `.app-shell` so group microsites keep their custom themes.
- **Admin (`/admin/*`)**: tool pages use the secondary-page look on a fixed asphalt ground, whatever the theme.
  - `src/routes/admin/+layout.svelte` supplies the ground (full-bleed, full height) and styles fields,
    headings, checkboxes, and outlined buttons once, so page code does not repeat them.
  - `AdminHero` is the compact hero: a magenta-marked eyebrow, a display title, an optional lead, and
    actions. `AdminNotice` is the status banner.
  - Pages are bands: numbered section headings (`01 Details`) on alternating 950 / 900 fields, rows that
    turn into color fields on hover, hairline tile grids, and a list beside a detail pane (the list is a
    violet-topped `surface-900` sidebar, the detail sits on asphalt).
  - Initials and logos are square tiles (`bg-surface-50`), never circles. Dangerous actions sit in a
    red-topped callout with one filled button.
