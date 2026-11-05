# Success Stack

**College is your first job.** Success Stack is a free guide for college students in any
major: the four blocks employers look for (skills, projects, certifications and internships),
the four windows that let employers see them (a resume, LinkedIn, GitHub or a portfolio, and
posts), when to build each one, and AI prompts that plan it all for your major.

Live site: <https://dezdickey.github.io/success-stack/>

## What's on it

| Page | What it does |
|---|---|
| [`index.html`](index.html) | The idea, the numbers behind it, the four blocks and four windows, and three things to do this week |
| [`roadmap.html`](roadmap.html) | A block every semester, the recruiting year, and where to look |
| [`prompts.html`](prompts.html) | Four AI prompts that fill in with your major, year and hours, with copy buttons and three rules for using AI safely |
| [`resume.html`](resume.html) | A first resume, step by step |
| [`linkedin.html`](linkedin.html) | A LinkedIn profile in ten minutes |
| [`card.html`](card.html) | One double-sided sheet to print: the Stack and the numbers on the front, a Stack Card to fill in on the back |
| [`sources.html`](sources.html) | Every number, its source, the date it was checked, and its limits |

## Privacy and security

- **It collects nothing.** No cookies, analytics, trackers or accounts, and no request to any
  other site: fonts are the system's own and the QR codes are image files in this repo.
- **What you type stays on the page.** The prompt form fills the prompts in on your device and
  stores nothing.
- **A strict Content Security Policy** on every page: scripts and styles only from this site,
  no inline scripts or styles, no network requests, no forms that submit anywhere.
- **It works with JavaScript turned off.** Every page is plain HTML; the script only adds the
  copy buttons, the prompt fill-in and presenting.

## Presenting it

The site doubles as the material for a one-hour class. Open `index.html`, press **P** (or the
**Present** button), and **F11** for full screen. A clicker, PageDown or the arrow keys step
through one path across the pages: why it matters, the Stack, the story behind it, the roadmap,
the AI prompts, LinkedIn, and what to do this week. **B** blanks the screen, **Home** and **End**
jump to the ends, and **Esc** goes back to the normal page.

## How it's built

Plain HTML, CSS and JavaScript, with no framework, no build step and no dependencies. It runs
from a downloaded copy (`file://`, no internet needed) or from GitHub Pages.

The QR codes are made on this computer by [`tools/qr.js`](tools/qr.js), and every code is
decoded again by a separate checker, [`tools/qr-check.js`](tools/qr-check.js), before it is
used. Open [`tools/make-qr.html`](tools/make-qr.html) to run both.

Built with AI coding assistance. I designed it and directed the decisions.

Made by [Desmond Dickey](https://www.linkedin.com/in/desmond-dickey). An independent project,
not affiliated with any college or employer.
