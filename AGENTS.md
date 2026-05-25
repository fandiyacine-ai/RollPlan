<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QA Gate — mandatory after every code task

After completing any development task (bug fix, feature, refactor), you MUST invoke the `dev-qa` skill before declaring the task complete. Do not say "done", "complete", "fixed", or "shipped" until the skill has run and passed. The skill handles TypeScript checking and Playwright verification against Railway production. This is non-negotiable — the user has explicitly required it.
