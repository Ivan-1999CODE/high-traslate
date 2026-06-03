# high-traslate

Cloudflare Pages settings:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `/`
- Environment variable: `GEMINI_API_KEY`
- Optional environment variable: `GEMINI_MODEL` (default: `gemini-2.5-flash`)

Do not put the Google API key in `index.html`. The page calls `/api/ai-teacher`, and the Cloudflare Pages Function reads `GEMINI_API_KEY`.
