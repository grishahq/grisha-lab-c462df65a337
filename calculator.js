(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgentBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function number(value, label, minimum, maximum, integer) {
    if ((typeof value === 'string' && value.trim() === '') || value === null || value === undefined || typeof value === 'boolean' || !['number', 'string'].includes(typeof value)) {
      throw new Error(label + ' is required.');
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < minimum || n > maximum || (integer && !Number.isInteger(n))) {
      throw new Error(label + ' must be ' + (integer ? 'a whole number' : 'a number') + ' from ' + minimum + ' to ' + maximum + '.');
    }
    return n;
  }

  function expectedAttempts(retryProbability, maxRetries) {
    const p = number(retryProbability, 'Retry probability', 0, 1, false);
    const r = number(maxRetries, 'Maximum retries', 0, 10, true);
    let attempts = 1;
    let term = 1;
    for (let i = 1; i <= r; i += 1) {
      term *= p;
      attempts += term;
    }
    return attempts;
  }

  function calculate(settings) {
    if (!settings || !Array.isArray(settings.steps) || !settings.steps.length || settings.steps.length > 20) {
      throw new Error('Add between 1 and 20 steps.');
    }
    const runs = number(settings.runs, 'Workflow runs', 1, 1000000, true);
    const hit = number(settings.cacheHit, 'Cache hit share', 0, 1, false);
    const priceValues = settings.prices || {};
    const values = [priceValues.input, priceValues.cached, priceValues.output];
    const hasAnyPrice = values.some(v => v !== '' && v !== null && v !== undefined);
    const hasAllPrices = values.every(v => v !== '' && v !== null && v !== undefined);
    if (hasAnyPrice && !hasAllPrices) throw new Error('Enter all three prices, or leave all three empty for tokens only.');
    const prices = hasAllPrices ? {
      input: number(priceValues.input, 'Input price', 0, 1000000, false),
      cached: number(priceValues.cached, 'Cached input price', 0, 1000000, false),
      output: number(priceValues.output, 'Output price', 0, 1000000, false)
    } : null;
    const totals = { expected: empty(), worst: empty() };
    const steps = settings.steps.map((step, index) => {
      const label = 'Step ' + (index + 1);
      const fresh = number(step.fresh, label + ' fresh input', 0, 1000000000, true);
      const reusable = number(step.reusable, label + ' reusable context', 0, 1000000000, true);
      const output = number(step.output, label + ' output', 0, 1000000000, true);
      const p = number(step.retryProbability, label + ' retry probability', 0, 1, false);
      const retries = number(step.maxRetries, label + ' maximum retries', 0, 10, true);
      const attempts = expectedAttempts(p, retries);
      const perAttempt = { input: fresh + reusable * (1 - hit), cached: reusable * hit, output };
      const expected = multiply(perAttempt, attempts * runs, prices);
      const worst = multiply(perAttempt, (retries + 1) * runs, prices);
      add(totals.expected, expected);
      add(totals.worst, worst);
      return { name: String(step.name || label).slice(0, 80), attempts, maxAttempts: retries + 1, expected, worst };
    });
    for (const totalsForCase of [totals.expected, totals.worst]) {
      totalsForCase.tokens = totalsForCase.input + totalsForCase.cached + totalsForCase.output;
      if (!prices) totalsForCase.cost = null;
    }
    const noCacheCost = prices ? steps.reduce((sum, step, index) => {
      const source = settings.steps[index];
      return sum + ((Number(source.fresh) + Number(source.reusable)) * prices.input + Number(source.output) * prices.output) * step.attempts * runs / 1000000;
    }, 0) : null;
    return { runs, prices, steps, ...totals, noCacheCost, estimatedCacheSavings: prices ? noCacheCost - totals.expected.cost : null };
  }

  function empty() { return { input: 0, cached: 0, output: 0, cost: 0 }; }
  function multiply(tokens, attempts, prices) {
    const result = { input: tokens.input * attempts, cached: tokens.cached * attempts, output: tokens.output * attempts };
    result.tokens = result.input + result.cached + result.output;
    result.cost = prices ? (result.input * prices.input + result.cached * prices.cached + result.output * prices.output) / 1000000 : null;
    return result;
  }
  function add(target, source) {
    target.input += source.input;
    target.cached += source.cached;
    target.output += source.output;
    target.cost += source.cost === null ? 0 : source.cost;
  }
  return { calculate, expectedAttempts };
});
