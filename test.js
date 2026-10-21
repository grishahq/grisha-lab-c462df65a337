'use strict';
const assert = require('node:assert/strict');
const { calculate, expectedAttempts } = require('./calculator.js');
let count = 0;
function test(name, fn) { fn(); count += 1; console.log('PASS ' + name); }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' != ' + expected); }
const base = () => ({ runs: 1, cacheHit: 0, prices: { input: 1, cached: 0.1, output: 3 }, steps: [{ name: 'Check', fresh: 1000, reusable: 2000, output: 500, retryProbability: 0, maxRetries: 2 }] });

test('zero retry probability needs one attempt', () => near(expectedAttempts(0, 10), 1));
test('certain retries reach the hard bound without division by zero', () => near(expectedAttempts(1, 10), 11));
test('bounded geometric retries include the initial attempt', () => near(expectedAttempts(0.5, 2), 1.75));
test('zero retry cap ignores retry probability', () => near(expectedAttempts(1, 0), 1));
test('known one-step cost and worst-case cap', () => {
  const r = calculate(base());
  near(r.expected.cost, 0.0045); near(r.worst.cost, 0.0135);
  near(r.expected.tokens, 3500); near(r.worst.tokens, 10500);
});
test('cache eligibility changes billing, not total token volume', () => {
  const s = base(); s.cacheHit = 0.75;
  const r = calculate(s);
  near(r.expected.input, 1500); near(r.expected.cached, 1500);
  near(r.expected.tokens, 3500); near(r.expected.cost, 0.00315);
  near(r.estimatedCacheSavings, 0.00135);
});
test('multiple steps, retries and planned runs scale independently', () => {
  const s = base(); s.runs = 10; s.steps[0].retryProbability = 0.5;
  s.steps.push({ name: 'Second', fresh: 100, reusable: 0, output: 100, retryProbability: 0, maxRetries: 0 });
  const r = calculate(s);
  near(r.expected.cost, 10 * (0.0045 * 1.75 + 0.0004));
  near(r.worst.cost, 10 * (0.0045 * 3 + 0.0004));
});
test('empty prices allow a token-only estimate', () => {
  const s = base(); s.prices = { input: '', cached: '', output: '' };
  const r = calculate(s); assert.equal(r.expected.cost, null); assert.equal(r.noCacheCost, null); near(r.expected.tokens, 3500);
});
test('partial pricing is rejected rather than treated as free', () => {
  const s = base(); s.prices.cached = ''; assert.throws(() => calculate(s), /all three prices/);
});
test('zero tokens and zero prices are valid', () => {
  const s = base(); s.steps[0].fresh = s.steps[0].reusable = s.steps[0].output = 0; s.prices = { input: 0, cached: 0, output: 0 };
  const r = calculate(s); near(r.expected.cost, 0); near(r.expected.tokens, 0);
});
test('a higher cached price honestly produces negative savings', () => {
  const s = base(); s.cacheHit = 1; s.prices.cached = 2;
  near(calculate(s).estimatedCacheSavings, -0.002);
});
test('unsupported and non-finite numeric input is rejected', () => {
  for (const value of [-1, NaN, Infinity, '', ' ', true, [], {}]) {
    const s = base(); s.steps[0].fresh = value; assert.throws(() => calculate(s));
  }
  for (const value of [-0.1, 1.1, Infinity]) assert.throws(() => expectedAttempts(value, 2));
  for (const value of [-1, 1.5, 11]) assert.throws(() => expectedAttempts(0.2, value));
});
test('workflow and step bounds prevent nonsensical or unbounded scenarios', () => {
  for (const value of [0, 1.5, 1000001]) { const s = base(); s.runs = value; assert.throws(() => calculate(s)); }
  const s = base(); s.steps = []; assert.throws(() => calculate(s));
  s.steps = Array(21).fill(base().steps[0]); assert.throws(() => calculate(s));
});
test('expected cost stays at or below the bounded worst case', () => {
  for (let cap = 0; cap <= 10; cap += 1) for (let pct = 0; pct <= 100; pct += 5) {
    const s = base(); s.steps[0].maxRetries = cap; s.steps[0].retryProbability = pct / 100;
    const r = calculate(s); assert.ok(r.expected.cost <= r.worst.cost + 1e-12);
  }
});
console.log('\n' + count + ' tests passed.');
