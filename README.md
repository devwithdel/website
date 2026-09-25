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
- Continuous technology carousel with pause-on-hover/focus behavior
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
└── src
    ├── assets
    │   ├── images
    │   └── audio
    ├── css
    │   └── style.css
    └── js
        └── script.js
```

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
