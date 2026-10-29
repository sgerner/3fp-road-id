# Design Language: Lane Lines

3 Feet Please's visual language takes its cues from road markings, race bibs, and bike-poster
typography. Pages should look like a well-painted street: bold, flat, and easy to read at speed.

Reference implementation: [`src/routes/+page.svelte`](../src/routes/+page.svelte) (homepage).

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

## Components

**Buttons**: rectangular, uppercase, `font-black`, generous padding (`px-7 py-4`).

- Solid: `bg-surface-950 text-primary-500` on light fields; `bg-primary-500 text-surface-950`
  on dark fields.
- Outline: `border-[3px] border-surface-950` (or `border-surface-50` on dark), filling solid on hover.
- Trailing arrow nudges right on hover (`group-hover:translate-x-1`).

**Tags**: a flat block pinned to an edge, e.g. `absolute top-0 left-0 bg-primary-500 px-4 py-2`
with eyebrow text. Used for "Next up near you", "Riding with".

**Lists**: rows divided by `border-b border-surface-800` under a heavy `border-t-2` rule.
Each row has an index numeral, a square logo tile (`bg-surface-50`), a title, meta text,
and an arrow. Hover turns the whole row into a color field (`hover:bg-primary-500
hover:text-surface-950`).

**Action triptych**: three sibling tiles in primary / secondary / tertiary, each one big link
with an icon, an up-right arrow, and an uppercase italic title.

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
