# oparli.com

Personal portfolio site for Jakub Waszczak. Plain static site, no framework, no
build step.

## Structure

```
index.html      single page, five sections
css/style.css   design system + layout
js/hero.js      canvas contour animation (vanilla, zero dependencies)
js/main.js      nav scroll behavior
```

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploy

Cloudflare Pages, direct from this repo. No build command; output directory `/`.
Custom domain: oparli.com.
