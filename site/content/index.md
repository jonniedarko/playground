---
title: Field Notes
description: A personal reference library - notes, manuals and cheat sheets, kept as plain Markdown and published as a static site.
---

This is a small, static documentation site for keeping notes organised by topic.
Each topic lives in its own section, and every section can hold as many
sub-pages as it needs.

Everything is written as Markdown under `site/content/`. The build step turns
each file into a standalone HTML page - no framework, no runtime dependencies,
and nothing to keep running once it is deployed.

## How it is organised

- **Sections** are folders. The folder's `index.md` gives it a title, a short
  description and its position in the sidebar.
- **Pages** are Markdown files inside a section. They can nest as deep as the
  subject needs.
- **Search** covers every page's title, headings and body text, and works
  entirely in the browser.

## Sections
