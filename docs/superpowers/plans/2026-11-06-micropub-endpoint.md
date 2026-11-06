# Micropub endpoint

Implement the next slice of [the plan](../../indieweb-publishing/DESIGN.md) inline. Keep live publishing disabled unless explicitly configured; preserve current discovery links until cutover.

- [x] Add tests, then implement trusted-provider token introspection with owner/scopes/expiry checks. No caller-selected verification URLs or cached authorization results.
- [x] Add tests, then implement bounded JSON/form parsing, source/config queries, and Git-backed create/update/delete/restore with stable dated URLs and revision checks. Expose through `/micropub` only when enabled. Reject unsupported private/draft writes, rich HTML, binary uploads, and syndication requests explicitly for this slice.
- [x] Honor literal-text source and deletion/publication flags in public readers/rendering. Test without changing legacy Markdown semantics.
- [x] Run tests, compare diagnostic baseline, production build, preview checks, and independent review. Commit the working slice.

Configuration: fixed owner profile, HTTPS introspection endpoint and server credential, repository/branch/write token, explicit enabled flag. Existing production discovery remains on IndieKit until a preview has passed real-client testing. No production resource changes or writes in this task.

Verification: 58 tests pass; production build passes; diagnostics match the existing 71 errors and 5 warnings. Local Wrangler checks returned 503 for unconfigured Micropub GET/form POST, 403 for an unrelated cross-origin form POST, and 200 for posts, tag, date, and permalink pages.

Independent review found cross-folder URL creation races, whole-property deletion validation, and truncated published arrays. Reproduced each with failing tests, then fixed them. Writes now use GitHub expected-head commits; stale branches return conflicts without retries. Added regressions for summary serialization, empty source after content deletion, and preview repository/branch reads. No live provider/token/Git write test or production cutover was performed.
