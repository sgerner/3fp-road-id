# Learn reading and authoring experience

The library keeps ordinary search and category filters immediately available. “Ask the library” is optional: it interprets a request, searches published articles, and explains verified results. Returned article links always come from database records.

Articles display their full body with a responsive outline, readable line lengths, and scrollable tables/code. Discussion, attachments, and history are disclosed on demand. Heading IDs are derived from Markdown tokens, so code examples do not create phantom outline entries and duplicate headings receive unique anchors. Old revisions regenerate their reading aids from revision content and do not expose the current-article assistant.

New and edit pages share `LearnAuthoringForm`. Title and body lead; writing help, article details, and media are optional. The editor supports rich text and Markdown. AI drafts require explicit application and offer undo that refuses to overwrite subsequent edits. Takeaway previews can also supply a short summary for explicit application.

## AI configuration and behavior

The `/api/learn/ai` endpoint uses the existing `structured_text` model profile (`AI_MODEL_STRUCTURED_TEXT`, with the configured default-model behavior). Its fallback model is `openai/gpt-6-luna`, using the server-side `OPENAI_API_KEY`. Other supported structured-text providers use the existing model registry and their credentials. No browser credentials or new database migration are needed.

Actions:

- `ask`: published-article questions, using `articleSlug` or `articleId` and `question`. Unpublished articles are available only to their author.
- `navigate`: natural-language `question`, returning a grounded explanation and verified article records.
- `write`: authenticated writing instructions (`prompt`, `title`, `content`), returning a Markdown draft.
- `takeaways`: authenticated `title`, `summary`, and `content`, returning a reader summary and takeaways.

AI inputs and outputs are bounded and validated. Public reader requests and authenticated creator requests use the existing per-instance rate limiter; distributed production deployments should retain their normal edge limits. Article source material is explicitly treated as untrusted data in prompts.

New and edited articles generate reader summaries and takeaways when saved, allowing up to 15 seconds for AI. Missing configuration, invalid output, timeouts, quota exhaustion, or articles longer than the 18,000-character AI context limit use the local reading-aid generator so saving remains available. On-demand writing rejects oversized drafts instead of silently deleting their tail. Questions about longer articles select relevant indexed sections and disclose the limited source excerpt. On-demand provider calls have a 30-second budget.

Existing articles keep their stored takeaways until edited. Creator tools require authentication. Viewing and library navigation remain available anonymously.

## Verification

Focused unit tests cover heading anchors, sanitized rendering, source limits, structured output validation, access rules, navigation confidence, and timeout fallback. Browser review covers library/article/editor layouts at phone, tablet, and desktop sizes. Live checks exercise article questions and library navigation; malformed request and unauthenticated writing checks verify API errors. The editor is previewed with temporary sample content without publishing an article.
