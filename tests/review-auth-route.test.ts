import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, dynamic } from "../src/app/api/auth/review/route";
import {
  getReviewTier,
  normalizeNextPath,
} from "../src/app/api/auth/review/helpers";

const VALID_REVIEW_TOKEN = "review-token-012345678901234567890123";

function request(search: string): NextRequest {
  return new NextRequest(`http://localhost/api/auth/review${search}`);
}

test("review auth route is forced dynamic so token checks happen at request time", () => {
  assert.equal(dynamic, "force-dynamic");
});

test("normalizeNextPath accepts only same-origin absolute paths", () => {
  assert.equal(normalizeNextPath("/creator/foo"), "/creator/foo");
  assert.equal(normalizeNextPath(""), "/");
  assert.equal(normalizeNextPath(null), "/");
  assert.equal(normalizeNextPath("https://evil.example/path"), "/");
  assert.equal(normalizeNextPath("//evil.example/path"), "/");
});

test("getReviewTier only accepts reviewable paid tiers", () => {
  assert.equal(getReviewTier("pro"), "pro");
  assert.equal(getReviewTier("alpha"), "alpha");
  assert.equal(getReviewTier("free"), null);
  assert.equal(getReviewTier(null), null);
});

test("GET returns 404 when review login is not configured", async () => {
  const previous = process.env.REVIEW_ACCESS_TOKEN;
  delete process.env.REVIEW_ACCESS_TOKEN;

  try {
    const response = await GET(request("?token=nope&tier=pro"));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "review_login_disabled" });
  } finally {
    if (previous === undefined) delete process.env.REVIEW_ACCESS_TOKEN;
    else process.env.REVIEW_ACCESS_TOKEN = previous;
  }
});

test("GET rejects an invalid review token before creating a session", async () => {
  const previous = process.env.REVIEW_ACCESS_TOKEN;
  process.env.REVIEW_ACCESS_TOKEN = VALID_REVIEW_TOKEN;

  try {
    const response = await GET(request("?token=wrong&tier=pro"));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  } finally {
    if (previous === undefined) delete process.env.REVIEW_ACCESS_TOKEN;
    else process.env.REVIEW_ACCESS_TOKEN = previous;
  }
});

test("GET rejects invalid review tiers", async () => {
  const previous = process.env.REVIEW_ACCESS_TOKEN;
  process.env.REVIEW_ACCESS_TOKEN = VALID_REVIEW_TOKEN;

  try {
    const response = await GET(request(`?token=${VALID_REVIEW_TOKEN}&tier=free`));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_tier",
      allowed_tiers: ["pro", "alpha"],
    });
  } finally {
    if (previous === undefined) delete process.env.REVIEW_ACCESS_TOKEN;
    else process.env.REVIEW_ACCESS_TOKEN = previous;
  }
});
