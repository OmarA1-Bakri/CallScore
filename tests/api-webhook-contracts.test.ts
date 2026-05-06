import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createApiKeyRevealCookieValue,
  parseApiKeyRevealCookieValue,
} from "@/lib/api-keys";
import {
  createWebhookRevealCookieValue,
  decryptWebhookSecret,
  encryptWebhookSecret,
  isPrivateWebhookAddress,
  normalizeWebhookEvents,
  parseWebhookRevealCookieValue,
  validateWebhookUrl,
} from "@/lib/webhooks";

test("API key reveal cookies round-trip and reject invalid payloads", () => {
  const encoded = createApiKeyRevealCookieValue({
    name: "Production read key",
    prefix: "ctr_alpha_demo",
    secret: "ctr_alpha_secret_value",
  });

  assert.deepEqual(parseApiKeyRevealCookieValue(encoded), {
    name: "Production read key",
    prefix: "ctr_alpha_demo",
    secret: "ctr_alpha_secret_value",
  });
  assert.equal(parseApiKeyRevealCookieValue("not-base64"), null);
});

test("Webhook reveal cookies round-trip and reject invalid payloads", () => {
  const encoded = createWebhookRevealCookieValue({
    url: "https://hooks.example.com/callscore",
    secret: "webhook_secret_value",
  });

  assert.deepEqual(parseWebhookRevealCookieValue(encoded), {
    url: "https://hooks.example.com/callscore",
    secret: "webhook_secret_value",
  });
  assert.equal(parseWebhookRevealCookieValue("bad-cookie"), null);
});

test("Webhook helpers enforce https URLs and known subscribable events", () => {
  assert.equal(
    validateWebhookUrl("https://hooks.example.com/callscore#ignore-me"),
    "https://hooks.example.com/callscore",
  );
  assert.equal(validateWebhookUrl("http://hooks.example.com/callscore"), null);
  assert.equal(validateWebhookUrl("https://127.0.0.1/callscore"), null);
  assert.equal(validateWebhookUrl("https://169.254.169.254/latest/meta-data"), null);
  assert.equal(validateWebhookUrl("https://localhost/callscore"), null);
  assert.equal(validateWebhookUrl("https://user:pass@hooks.example.com/callscore"), null);

  assert.deepEqual(
    normalizeWebhookEvents([
      "new_call_digest",
      "consensus_signal",
      "test.ping",
      "new_call_digest",
    ]),
    ["new_call_digest", "consensus_signal"],
  );
  assert.deepEqual(normalizeWebhookEvents([]), [
    "new_call_digest",
    "consensus_signal",
  ]);
});

test("Webhook secrets are encrypted at rest and decrypt with the server key", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-session-secret";
  try {
    const encrypted = encryptWebhookSecret("webhook_secret_value");
    assert.match(encrypted, /^enc:v1:/);
    assert.notEqual(encrypted.includes("webhook_secret_value"), true);
    assert.equal(decryptWebhookSecret(encrypted), "webhook_secret_value");
    assert.equal(decryptWebhookSecret("legacy_plaintext_secret"), "legacy_plaintext_secret");
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});

test("Webhook private address guard rejects loopback and metadata ranges", () => {
  assert.equal(isPrivateWebhookAddress("127.0.0.1"), true);
  assert.equal(isPrivateWebhookAddress("10.0.0.5"), true);
  assert.equal(isPrivateWebhookAddress("172.20.0.1"), true);
  assert.equal(isPrivateWebhookAddress("192.168.1.1"), true);
  assert.equal(isPrivateWebhookAddress("169.254.169.254"), true);
  assert.equal(isPrivateWebhookAddress("8.8.8.8"), false);
  assert.equal(isPrivateWebhookAddress("::1"), true);
});
