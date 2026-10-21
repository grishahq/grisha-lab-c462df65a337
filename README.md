# Agent Budget Lab

A dependency-free browser calculator for agent workflow token budgets. It makes retries and context reuse explicit and uses prices entered by the user. There are no built-in model prices, API calls, analytics, accounts or external assets.

## Run locally

Requirements: Python 3 for the optional local server; a modern browser with JavaScript enabled.

From this folder:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Visit `http://127.0.0.1:8766` in a browser. Stop the server with Ctrl+C. The files can also be opened directly with `index.html` in a modern browser.

## Use

1. Set the number of workflow runs and optional dollar budget.
2. Set cache hit share to 0% unless you have evidence for another value.
3. Add or edit up to 20 steps. Enter fresh input, reusable context and output tokens per attempt, retry chance, and a hard retry cap from 0 to 10.
4. Enter all three prices in USD per one million tokens, or leave all three empty for a token-only estimate. Zero is a valid price. No actual provider rates are supplied or fetched.
5. Compare expected usage with the retry ceiling. Download the inputs, computed results and assumptions as JSON if useful.

The prefilled workflow is an illustrative scenario, not a benchmark or a measured workload. Inputs are kept in memory for this tab and disappear on reload. Export is the only built-in way to save a scenario. There is no import feature.

## Calculation

For retry probability `p` and a maximum of `r` retries:

```text
expected attempts = 1 + p + p^2 + ... + p^r
retry ceiling attempts = 1 + r
cached tokens per attempt = reusable context * cache hit share
uncached tokens per attempt = fresh input + reusable context * (1 - cache hit share)
cost per attempt = (uncached tokens * input price + cached tokens * cached price + output tokens * output price) / 1,000,000
scenario expected cost = workflow runs * sum(expected attempts * cost per attempt)
```

`p` is the same conditional probability of another attempt at each retry. The finite sum handles both 0% and 100% without dividing by zero. All steps run on every workflow, including after a step has used its retry cap. The calculator estimates usage, not completion success.

The retry ceiling assumes every allowed retry happens at the same token volume and cache share. It is a retry bound under entered assumptions, not a guaranteed bill cap. Cache share is applied to each attempt, including the first. It models billing allocation, not fewer input tokens or fewer requests.

## Tests

Requirements: Node.js 18 or later. No package installation is needed.

```sh
node test.js
node --check calculator.js
node --check app.js
```

The 14 tests check known dollar and token totals, truncated retries, the 0% and 100% retry boundaries, no retries, context caching, multiple steps and runs, blank and partial prices, zero-cost inputs, more expensive cached pricing, invalid numbers, input limits, and the expected-cost invariant across 231 retry scenarios.

## Scope and limits

- One price set applies to all steps. There is no currency conversion or live price verification.
- Input and output token counts are user estimates. The app does not tokenize text or measure a real agent run.
- Token volume, retry probability and cache share are constant per attempt. Growing conversation history, branching, early termination and correlated failures are not modeled.
- Actual provider caching thresholds, prefix rules, expiry, eligibility and billing behavior may differ. First-attempt cache hits are not guaranteed.
- Tool fees, web search, storage, image or audio generation, taxes, discounts, rate limits, and provider-specific failed-request billing are excluded.
- Hidden reasoning tokens are not added automatically. Include billable reasoning tokens in the output estimate if appropriate.
- Very large estimates and fractional expected tokens use normal JavaScript floating-point arithmetic. They are planning estimates, not accounting records.
- Desktop Chrome extension checks covered default totals, manual price recalculation, cache-share changes, invalid partial prices, reset, and adding/removing steps. A real full-page screenshot is included. Mobile layout, screen readers and video were not tested or recorded.
- This prototype has not been deployed as a hosted website. Its source can be run locally.

## Files

- `index.html`: page structure, labels and visible assumptions.
- `style.css`: local responsive styles with system fonts.
- `app.js`: input handling, result display and JSON export.
- `calculator.js`: calculation module, usable in browsers and Node.js.
- `test.js`: automated calculation tests using Node.js built-in assertions.
- `evidence.json`: recorded checks and limitations for this actual build.

This is original project code. No external project source, libraries or assets were copied into the build.
