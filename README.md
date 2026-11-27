# Kazha

Static site. Deploys automatically on Netlify from the main branch.

## Pinterest search (optional)

`netlify/functions/pinterest-search.mts` serves `/api/pinterest?q=...` and calls the Pinterest API v5
"Search partner Pins" endpoint server-side. Set these in Netlify → Project configuration →
Environment variables (scope: Functions), then redeploy:

- `PINTEREST_ACCESS_TOKEN` (required) – OAuth access token of a Pinterest app that has Search API access
- `PINTEREST_COUNTRY` (optional, default `IN`)
- `PINTEREST_LOCALE` (optional, default `en-US`)

Without a token, or if the app has no search access, the site shows a clear message and no results.
