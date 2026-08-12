# Design — S2A Rate Bot

Locked Hallmark design system for the operations dashboard. Existing routes,
data contracts, navigation logic, and business copy remain unchanged.

## Genre

modern-minimal, technical and operational

## Macrostructure family

- App pages: Workbench — utility header, scan-friendly data surfaces, contextual detail rails.
- Overview page: Workbench — risk strip, metric summary, then operational detail.
- Embedded pages: full-bleed utility surface; no application navigation added.

## Theme

- Default: dark graphite paper with cool green-black surfaces.
- Accent: low-saturation deep teal, reserved for primary actions, active navigation, and positive system state.
- Light mode: warm grey paper with the same teal accent and status semantics.
- Status colors remain semantic: blue for rate/info, green for healthy/balance, amber for warnings, red for failures.

## Typography

- Body: Inter system stack, regular and medium weights.
- Numeric values: system monospace with tabular numerals.
- Headings: roman, compact, no italic display treatment.

## Spacing and shape

4-point rhythm expressed through the existing Tailwind spacing scale.
Panels and controls use restrained 8–10px radii, 1px borders, and low-contrast
depth. Tables keep horizontal scrolling on narrow screens.

## Motion and interaction

- CSS transitions use short ease-out transitions on color, border, shadow, opacity, and transform.
- Focus-visible rings are immediate and high contrast.
- Loading, disabled, error, and success states remain explicit and quiet.
- Reduced motion collapses spatial motion to an opacity-only transition.

## Navigation contract

The existing top navigation remains the navigation model. Preserve its route
map, active matching, desktop/mobile breakpoints, horizontal mobile scroll,
settings dialog, theme toggle, and Worker connection polling. Redesign only its
surface treatment, spacing, active state, and visual hierarchy.

## Component voice

- Primary buttons: solid teal, compact, single-line labels.
- Secondary buttons: surface fill with a quiet border and teal hover state.
- Panels: structured work surfaces, never decorative cards inside cards.
- Dense summaries: use dividers and compact metric grids inside a work surface instead of nested card chrome.
- Monitor cards: identity and status first, paired latency blocks, dominant availability conclusion, compact history bars.
- Tags: compact semantic status chips.
- Tables: dense header contrast, clear row dividers, restrained hover state.
- Narrow page headers: keep one primary command visible; secondary commands move into an accessible overflow menu.

## Per-page allowances

App pages use function-first layouts and no decorative hero imagery. The visual
variety comes from each page's data shape, not from changing the design system.
Overview pages prioritize actionable risks, then current status and supporting metrics.

## What must share

Top navigation behavior, brand lockup, accent color, type stack, spacing rhythm,
control states, table treatment, and dark/light theme relationship.
