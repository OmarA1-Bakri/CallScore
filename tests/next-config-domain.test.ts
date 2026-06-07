import assert from "node:assert/strict";
import { test } from "node:test";

const config = require("../next.config.js");

test("Next config redirects www host to canonical call-score.com apex", async () => {
  const redirects = await config.redirects();
  assert.deepEqual(redirects[0], {
    source: "/:path*",
    has: [{ type: "host", value: "www.call-score.com" }],
    destination: "https://call-score.com/:path*",
    permanent: true,
  });
  assert.doesNotMatch(JSON.stringify(redirects), /https:\/\/www\.call-score\.com/);
});

test("Next config keeps legacy route redirects in the single redirects block", async () => {
  const redirects = await config.redirects();
  assert.deepEqual(
    redirects.map((redirect: { source: string }) => redirect.source),
    ["/:path*", "/discover", "/experiences/:experienceId"],
  );
});
