// Tests for classifyProviderError() (src/providers/errors.js) — the Council
// Model Pre-check's product-level error categories: MODEL_UNAVAILABLE,
// AUTH_ERROR, BILLING_ERROR, RATE_LIMITED, TIMEOUT, PROVIDER_ERROR. Pure
// function, no config/network dependency — built entirely from the same
// err.status/err.code/err.message fields wrapProviderError()/httpError()
// already attach to every provider failure.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProviderError, httpError } from "../src/providers/errors.js";

function timeoutErr(code) {
  return Object.assign(new Error("timed out"), { code });
}

test("connection/inactivity/hard-task timeout codes classify as TIMEOUT", () => {
  for (const code of ["timeout", "connection_timeout", "inactivity_timeout", "hard_task_timeout"]) {
    assert.equal(classifyProviderError(timeoutErr(code)), "TIMEOUT");
  }
});

test("a network-layer failure (code 'network') classifies as PROVIDER_ERROR", () => {
  const err = Object.assign(new Error("fetch failed"), { code: "network" });
  assert.equal(classifyProviderError(err), "PROVIDER_ERROR");
});

test("401 or an auth-shaped message classifies as AUTH_ERROR", () => {
  assert.equal(classifyProviderError(httpError("OpenAI", 401, "Incorrect API key provided")), "AUTH_ERROR");
  // Google's own real shape: 400, not 401, distinguished by message text.
  assert.equal(classifyProviderError(httpError("Google", 400, "API key not valid. Please pass a valid API key.")), "AUTH_ERROR");
});

test("billing/credit exhaustion classifies as BILLING_ERROR — never generic MODEL_UNAVAILABLE, even on a 429", () => {
  assert.equal(
    classifyProviderError(httpError("OpenAI", 429, "You exceeded your current quota, please check your plan and billing details. insufficient_quota")),
    "BILLING_ERROR"
  );
  assert.equal(classifyProviderError(httpError("Anthropic", 400, "Your credit balance is too low to access the Anthropic API.")), "BILLING_ERROR");
  assert.equal(classifyProviderError(httpError("Generic", 402, "Payment required")), "BILLING_ERROR");
});

test("a plain rate limit (no billing keywords) classifies as RATE_LIMITED, distinct from BILLING_ERROR", () => {
  assert.equal(classifyProviderError(httpError("OpenAI", 429, "Rate limit reached for requests, please retry after a few seconds")), "RATE_LIMITED");
});

test("403/404 (access denied / model or endpoint not found) classifies as MODEL_UNAVAILABLE", () => {
  assert.equal(classifyProviderError(httpError("Anthropic", 403, "You do not have access to this model")), "MODEL_UNAVAILABLE");
  assert.equal(classifyProviderError(httpError("OpenAI", 404, "The model does not exist")), "MODEL_UNAVAILABLE");
});

test("a 5xx provider-side failure classifies as PROVIDER_ERROR", () => {
  assert.equal(classifyProviderError(httpError("Google", 503, "The service is currently unavailable")), "PROVIDER_ERROR");
  assert.equal(classifyProviderError(httpError("OpenAI", 500, "Internal server error")), "PROVIDER_ERROR");
});

test("an unrecognized/unknown-shaped error falls back to PROVIDER_ERROR rather than throwing", () => {
  assert.equal(classifyProviderError(new Error("something odd happened")), "PROVIDER_ERROR");
  assert.equal(classifyProviderError({}), "PROVIDER_ERROR");
});
