---
date: 2025-09-30T16:37:01.825-04:00
title: 2025-09-30 Changelog
summary: "43 commits across three repos. Mostly a way to test-drive Claude Code with Sonnet 4.5, but also some Codex PRs to keep getting a feel for its weird new async style of development. Adding some real and test posts. Lots of design changes, though this thing is still pretty ugly overall. Lots of refactors: Moving from inline styles to SCSS, from monolithic Nunjucks templates to WebC components, from Github Pages to Cloudflare Pages, adding media storage in Cloudflare R2 instead of Github. Updating webmention handling with Brid.gy, webmention.io, and 11ty plugins. (Webmentions are hard!?)"
category: changelog
visibility: public
updated: 2025-09-30T17:07:32.684-04:00
syndication:
  - https://social.coop/@caseyg/115295286201682942
  - https://bsky.app/profile/did:plc:s3fw2giksymfvruno3tvem4k/post/3m23glziobd2f
---

## 2025-09-29

* Morning: published "Rejection of AI Slop Aesthetic" article through Indiekit.
* Fixed permalink structure for all post types—articles, notes, bookmarks now use consistent date-based URLs.
* Improved article display. Removed redundant title links, adding trunctation on index pages, fixing ellipsis handling.
* Afternoon: typography pass on font sizing and spacing. Built tag system with index pages. Updated nav icons.
* Late afternoon: refactored inline styles into `posts.scss`.
* Display post metadata as a segmented pill, and update the display a bit. Feeling the liquid glass influence.
* Made date headers sticky.
* Evening: migrated from monolithic Nunjucks templates to some reusable WebC components: `date-header.webc`, `nav-toggles.webc`, `post-display.webc`, `post-footer.webc`, `posts-base.webc`. More to be done here.
* Trying to make things more DRY and consistent, e.g. same date formatting, metadata, and nav across all archive pages. Fixed post count logic that was lumping notes and bookmarks together.
* Adjusted pill dimensions to match iOS touch targets. Still wonky. Need to come back to it.

## 2025-09-30

* Morning: migrated site from GitHub Pages to Cloudflare Pages. Created `wrangler.jsonc`, deleted old GitHub Actions workflows, updated build script to pull content submodule.
* Added S3 store plugin to Indiekit for Cloudflare R2 media storage. Extracted 146 lines of Indiekit config from `package.json` into separate `indiekit.config.js`. GitHub repo now handles content, R2 handles media files.
* Afternoon: debugged env variables across several test deployments. `NODE_ENV` and `WEBMENTION_IO_TOKEN` needed specific handling in Cloudflare's build environment. Moved some dev dependencies to regular dependencies.
* Replaced 101 lines of generated webmentions handling with `@chrisburnell/eleventy-cache-webmentions` plugin.
* Added h-card author info for Bridgy support. Updated templates to use `webmentionsByUrl`. Normalized property names—some webmentions use `inReplyTo`, others use `in-reply-to`.
* Set up `.env` loading for local development. Tested webmention.io webhook.
