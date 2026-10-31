# Repository Instructions

- Do not create a new git branch unless the user explicitly asks for branch-based workflow.
- Work on the current branch, usually `main`, and commit there directly when asked to make changes.

- Before committing code changes, run `npm run lint`, `npm run check`, and `npm test`. Run `npm run build` followed by `npm run test:server-sanitizer` for production build or server dependency changes. Use Node 24 (`package.json` engines); CI runs the same checks on pull requests.
