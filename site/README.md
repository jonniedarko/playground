# Field Notes - static documentation site

A dependency-free static site generator for personal notes. Markdown in,
standalone HTML out. Mobile layout first; the desktop sidebar is added on top of
it.

## Running it

```sh
cd site
node build.mjs            # build into site/dist
node build.mjs --serve    # build, then serve on http://localhost:4321
```

There is nothing to install - it uses only the Node standard library, so any
Node 18+ will do.

To preview exactly what GitHub Pages will serve for a project page:

```sh
BASE_PATH=/playground node build.mjs --serve
```

## Adding content

Everything under `content/` becomes a page.

- A **folder** is a section. Its `index.md` supplies the section's title,
  description and sidebar position, and the section page automatically lists its
  children as cards.
- Any other **`.md` file** is a page inside that section.
- Folders nest as deep as you want.

Front matter is a small subset of YAML - flat `key: value` pairs only:

```markdown
---
title: Test instructions
description: One sentence, shown under the title and in search results.
order: 5
icon: 📘
---
```

| Key | Purpose |
| --- | --- |
| `title` | Page title. Falls back to a title-cased filename. |
| `description` | Shown as the lede, the meta description and the search snippet. |
| `order` | Sidebar position within its section. Unordered pages sort last, alphabetically. |
| `icon` | Optional emoji, shown in the sidebar and on section cards. |

### Starting a new topic

```sh
mkdir -p content/my-topic
cat > content/my-topic/index.md <<'EOF'
---
title: My topic
description: What this section covers.
order: 2
icon: 🧪
---

Intro paragraph.

## In this section
EOF
```

Then drop `.md` files alongside it. No registration step - the sidebar, search
index, breadcrumbs and prev/next links all come from the folder tree.

## Markdown supported

Headings, paragraphs, `**bold**`, `*italic*`, `~~strikethrough~~`, inline code,
links, images, ordered and unordered lists (nested), tables with alignment,
fenced code blocks, horizontal rules, blockquotes, and raw HTML blocks.

Internal links should be written root-relative so they pick up the base path:

```markdown
See [Registers](/shenzhen-io/language-reference/registers/).
```

### Callouts

```markdown
> [!NOTE]
> Something worth knowing.
```

`NOTE`, `TIP`, `WARNING` and `SPEC` are available. A plain `>` blockquote still
renders as a quote.

### Pin diagrams

Chip pinouts are markup rather than images, so they stay readable on a phone and
work in a screen reader. Keep the block contiguous - a blank line ends it.

```html
<div class="pinout" role="img" aria-label="Describe the layout for screen readers.">
<div class="pinout-col"><span class="pin pin-x">x0</span><span class="pin pin-s">p0</span></div>
<div class="pinout-chip"><span class="pinout-name">MC4000</span></div>
<div class="pinout-col"><span class="pin pin-s">p1</span><span class="pin pin-x">x1</span></div>
</div>
```

`pin-x` marks an XBus pin (yellow dot), `pin-s` a simple I/O pin, `pin-nc` an
unconnected one. Leave a `pinout-col` empty for a part with pins on one side.

## Deployment

`.github/workflows/deploy-docs.yml` builds the site and publishes it to GitHub
Pages on every push to `main` that touches `site/`. It sets `BASE_PATH`
automatically: `/<repo>` for a project page, empty for a `<user>.github.io`
repository.

To turn it on, set **Settings → Pages → Build and deployment → Source** to
**GitHub Actions**.

## Layout of this directory

```
site/
  build.mjs           generator and dev server
  lib/markdown.mjs    the Markdown renderer
  assets/             style.css, app.js, favicon.svg (copied verbatim)
  content/            the Markdown source
  dist/               build output (git-ignored)
```
