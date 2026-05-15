import { strict as assert } from "node:assert";
import crypto from "node:crypto";
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
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = "unit-test-webhook-secret-key";
  try {
    const encrypted = encryptWebhookSecret("webhook_secret_value");
    assert.match(encrypted, /^enc:v1:/);
    assert.doesNotMatch(encrypted, /webhook_secret_value/);
    assert.equal(decryptWebhookSecret(encrypted), "webhook_secret_value");
    assert.equal(decryptWebhookSecret("legacy_plaintext_secret"), "legacy_plaintext_secret");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("Webhook secrets encrypted with the legacy SHA-256 key still decrypt", () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = "unit-test-webhook-secret-key";
  try {
    const iv = Buffer.alloc(12, 1);
    const legacyKey = crypto.createHash("sha256").update(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update("legacy_webhook_secret", "utf8"),
      cipher.final(),
    ]);
    const encrypted = `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;

    assert.equal(decryptWebhookSecret(encrypted), "legacy_webhook_secret");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("Webhook encryption requires the dedicated webhook key", () => {
  const previousWebhookKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  const previousSessionSecret = process.env.SESSION_SECRET;
  delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.SESSION_SECRET = "unit-test-session-secret";
  try {
    assert.throws(
      () => encryptWebhookSecret("webhook_secret_value"),
      /WEBHOOK_SECRET_ENCRYPTION_KEY/,
    );
  } finally {
    if (previousWebhookKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previousWebhookKey;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
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
