# UI/UX pass — what changed

## Fixed bugs
- `SaanKape.png` was referenced but missing from the repo — the card rendered a
  broken-image icon. Added `SaanKape.svg` placeholder + an `onerror` fallback so
  no project card can ever show a broken icon again. **Swap in a real screenshot.**
- Dark mode's primary button used a gradient ending in `#2b2b2b` with `#0a0a0a`
  text — unreadable at one end. Now a light gradient.
- `cursor: none` was applied to inputs and textareas, removing the text I-beam.
- `.pricing-card .btn` styles existed in CSS but no pricing card had a button.
- Projects description had ~90 trailing spaces before the period.
- Junior High entry's logo had `alt="La Salle University Logo"` (wrong school).
- `fa-brands fa-flutter` / `fa-dart-lang` don't exist in Font Awesome Free —
  they rendered blank. Swapped for real solid icons.
- `<div class="La Salle University - Ozamiz">` — class attribute with spaces.
- Stray backslash after the `.ic-photoshop` rule.

## Navigation (the biggest gap)
- The header had a logo and a theme toggle and nothing else. Eight sections,
  no way to reach any of them. Added a real nav, a mobile drawer, and scrollspy.

## Information architecture
- Reordered: Hero → About → **Projects** → Skills → Education → Certifications
  → Pricing → Contact. Work now appears before rates.

## Accessibility
- `<main>` landmark, skip link, `<nav aria-label>`.
- Certification card was `<div role="button">` — now a real `<button>`.
- Modal: focus moves in on open, is trapped while open, and returns to the
  trigger on close.
- Theme button announces the action ("Switch to dark theme"), not the state.
- Marquee's duplicated half hidden from screen readers; Flutter/Dart pills are
  no longer wrongly `aria-hidden` in the first (real) set.
- `--color-muted` darkened `#737373` → `#5f5f5f` for AA in light mode.
- Reduced-motion now disables the custom cursor, ambient spotlight, and marquee.

## Polish & performance
- One vertical rhythm scale via `main > section`; consistent dividers and radii.
- Marquee pauses on hover/focus so the pills are readable.
- Pricing cards got CTAs, bottom-aligned via flex.
- `loading="lazy"` on below-fold images; width/height + `fetchpriority` on the
  hero image (CLS); `defer` on Lucide; preload + OG tags.
- Page title was "Del".

## Still worth doing
- Replace the SaanKape placeholder with a real screenshot.
- Self-host the 15 icons you use instead of loading all of Font Awesome.
- The music player is charming but large; consider collapsing it by default.
