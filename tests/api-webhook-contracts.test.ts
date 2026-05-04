import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createApiKeyRevealCookieValue,
  parseApiKeyRevealCookieValue,
} from "@/lib/api-keys";
import {
  createWebhookRevealCookieValue,
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
