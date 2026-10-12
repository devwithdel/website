# Rhodell A. Tagama Jr. — Portfolio

A minimalist, responsive personal portfolio for Rhodell A. Tagama Jr., a third-year BSIT student and web/software developer at La Salle University – Ozamiz.

The site focuses on Rhodell’s work, background, technologies, services, and contact information with a clean monochrome visual system and restrained motion.

## Live site

- Portfolio: [devwithdel.vercel.app](https://devwithdel.vercel.app/)
- Repository: [github.com/devwithdel/website](https://github.com/devwithdel/website)

## Features

- Responsive portfolio layout for desktop, tablet, and mobile
- Light, dark, and system theme modes
- Smooth circular theme reveal transition
- Keyboard-accessible `Ask anything` command navigation (`Ctrl/⌘ + K`)
- Stacked project card deck with keyboard controls
- Interactive stack-of-cards skills section: click a stack to expand its details
- Accessible certificate preview modal
- Contact form powered by Formspree
- Contact channels for email, GitHub, and LinkedIn
- Copy-to-clipboard email action
- Subtle entrance and hover motion using Motion
- Reduced-motion support
- Custom circular pointer for fine-pointer devices
- Semantic HTML, accessible labels, keyboard focus states, and skip navigation

## Sections

- Hero and introduction
- About and interests
- Featured projects
- Technology stack
- Education timeline
- Certifications
- Services and pricing
- Contact form and social channels

## Tech stack

- HTML5
- CSS3
- JavaScript
- Motion for lightweight UI animation
- Lucide Icons
- Font Awesome
- Toastify.js
- Formspree

The website is intentionally built as a static site. It does not require a build step or framework runtime.

## Project structure

```text
.
├── index.html
├── package.json
├── README.md
├── scripts
│   └── audit.mjs
└── src
    ├── assets
    │   └── images
    ├── css
    │   └── style.css
    └── js
        └── script.js
```

## Testing

The site has no framework and no build step, so testing is a dependency-free
static audit that cross-checks the HTML, CSS and JavaScript against each other:

```bash
npm test          # self-test the auditor, then audit the site
npm run audit     # audit the site only
npm run test:audit # self-test the auditor only
```

`npm run audit` walks every `.html`, `.css` and `.js` file and reports three
levels. It exits non-zero if there is at least one **error**.

| Level | Meaning |
| --- | --- |
| `ERROR` | Definitely broken. Fix before publishing. |
| `WARN` | Suspicious, or an accessibility/robustness risk. |
| `info` | Cosmetic note, e.g. a class hook that nothing styles. |

Checks performed:

- **HTML** — unbalanced or mismatched tags, duplicate `id`s, missing local
  assets, `href="#…"` anchors with no target, `aria-labelledby` /
  `aria-describedby` / `aria-controls` pointing at missing ids, `aria-hidden`
  on focusable elements, positive `tabindex`, skipped heading levels, missing
  `alt`, and controls with no accessible name.
- **CSS** — unbalanced braces, unclosed blocks, malformed declarations, invalid
  hex colours, bad `rgb()`/`rgba()` arity, unbalanced parentheses,
  `var(--x)` used but never defined, conflicting duplicate declarations in one
  block, empty rules, dead selectors (a class no markup uses and no script
  toggles), markup classes with no rule, and content that is transparent by
  default and only revealed on `:hover`.
- **JavaScript** — syntax errors in both external and inline scripts (checked
  with `node --check`), and `#id` selectors passed to `querySelector` /
  `getElementById` that match no element.
- **Caching** — warns when `style.css` is newer than the page that links it
  while the `?v=` cache-buster is unchanged, which is how a stale stylesheet
  silently reaches visitors.

`npm run test:audit` builds a deliberately broken site in a temporary folder
and asserts that all 15 bug classes above are actually detected, so the checks
cannot quietly decay into no-ops.

> **Note:** bump the `?v=` query on the `<link>` to `style.css` whenever you
> change the CSS, or visitors keep seeing the previous stylesheet.

## Run locally

You can serve the project with any static web server. For example:

```bash
npx serve .
```

Or with Python:

```bash
python -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

Opening `index.html` directly may work, but a local server is recommended for consistent asset loading and browser behavior.

## Contact form

The contact form submits to Formspree using the endpoint configured in `index.html`. Visitors can also contact Rhodell directly through the email channel shown in the Contact section.

## Deployment

The repository is connected to Vercel for the production deployment. Any push to the `main` branch can trigger the configured deployment workflow.

## License

This project is personal portfolio work and is not intended for redistribution without permission.
