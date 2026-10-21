'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const num = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const money = value => '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 4 });
  const stepContainer = byId('steps');
  let lastScenario = null;
  const example = [
    { name: 'Plan', fresh: 800, reusable: 6000, output: 600, retry: 15, cap: 1 },
    { name: 'Build', fresh: 2200, reusable: 9000, output: 2200, retry: 25, cap: 2 },
    { name: 'Review', fresh: 1600, reusable: 8000, output: 800, retry: 10, cap: 1 }
  ];

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function field(container, labelText, key, value, max) {
    const label = element('label', '', labelText);
    const input = element('input');
    input.type = 'number'; input.min = '0'; input.max = String(max); input.step = '1';
    input.dataset.field = key; input.value = String(value);
    label.append(input); container.append(label);
  }

  function addStep(data) {
    if (stepContainer.children.length >= 20) return;
    const row = element('article', 'step');
    const header = element('div', 'step-header');
    header.append(element('span', 'step-number'));
    const name = element('input', 'step-name'); name.type = 'text'; name.maxLength = 80; name.value = data.name; name.dataset.field = 'name'; name.setAttribute('aria-label', 'Step name');
    header.append(name);
    const remove = element('button', 'remove-step', 'Remove'); remove.type = 'button'; remove.addEventListener('click', () => { row.remove(); renumber(); update(); });
    header.append(remove); row.append(header);
    const tokens = element('div', 'step-tokens');
    field(tokens, 'Fresh input', 'fresh', data.fresh, 1000000000);
    field(tokens, 'Reusable context', 'reusable', data.reusable, 1000000000);
    field(tokens, 'Output', 'output', data.output, 1000000000);
    row.append(tokens);
    const retry = element('div', 'retry-settings');
    field(retry, 'Retry chance, %', 'retry', data.retry, 100);
    field(retry, 'Max retries', 'cap', data.cap, 10);
    retry.append(element('p', 'attempts-note'));
    row.append(retry); stepContainer.append(row); renumber();
  }

  function renumber() {
    [...stepContainer.children].forEach((row, i) => {
      row.querySelector('.step-number').textContent = String(i + 1).padStart(2, '0');
      const name = row.querySelector('[data-field="name"]').value || 'step ' + (i + 1);
      row.querySelector('.remove-step').disabled = stepContainer.children.length === 1;
      row.querySelector('.remove-step').setAttribute('aria-label', 'Remove ' + name);
    });
    byId('add-step').disabled = stepContainer.children.length >= 20;
  }

  function readScenario() {
    const steps = [...stepContainer.children].map(row => {
      const val = key => row.querySelector('[data-field="' + key + '"]').value;
      if (val('retry') === '') throw new Error('Every step needs a retry chance.');
      return { name: val('name'), fresh: val('fresh'), reusable: val('reusable'), output: val('output'), retryProbability: Number(val('retry')) / 100, maxRetries: val('cap') };
    });
    if (byId('cacheHit').value === '') throw new Error('Enter a cache hit share, including 0 if unknown.');
    const budget = byId('budget').value;
    if (budget !== '' && (!Number.isFinite(Number(budget)) || Number(budget) < 0 || Number(budget) > 1000000000)) throw new Error('Budget must be from 0 to 1,000,000,000 USD.');
    return { runs: byId('runs').value, cacheHit: Number(byId('cacheHit').value) / 100, prices: { input: byId('inputPrice').value, cached: byId('cachedPrice').value, output: byId('outputPrice').value }, steps, budget: budget === '' ? null : Number(budget) };
  }

  function update() {
    try {
      const scenario = readScenario();
      const result = AgentBudget.calculate(scenario);
      byId('error').hidden = true; byId('results-title').closest('section').classList.remove('invalid-results'); byId('export').disabled = false;
      byId('expected-cost').textContent = result.prices ? money(result.expected.cost) : 'Enter prices';
      byId('worst-cost').textContent = result.prices ? money(result.worst.cost) : num(result.worst.tokens) + ' tokens';
      byId('expected-tokens').textContent = num(result.expected.tokens) + ' expected tokens across ' + num(result.runs) + ' runs';
      byId('worst-tokens').textContent = num(result.worst.tokens) + ' tokens if every retry is used';
      byId('fresh-total').textContent = num(result.expected.input);
      byId('cached-total').textContent = num(result.expected.cached);
      byId('output-total').textContent = num(result.expected.output);
      byId('cache-saving').textContent = result.prices ? (result.estimatedCacheSavings >= 0 ? money(result.estimatedCacheSavings) + ' estimated savings' : money(-result.estimatedCacheSavings) + ' estimated extra cost') + ' from caching, compared with all input at the uncached rate.' : 'Add your prices to estimate cost. No prices are assumed.';
      byId('budget-result').hidden = scenario.budget === null || !result.prices;
      if (scenario.budget !== null && result.prices) {
        const pct = scenario.budget === 0 ? (result.expected.cost === 0 ? 0 : Infinity) : result.expected.cost / scenario.budget * 100;
        byId('budget-text').textContent = Number.isFinite(pct) ? num(pct) + '%' : 'Over $0 budget';
        byId('budget-fill').style.width = Math.min(100, pct) + '%';
        byId('budget-fill').classList.toggle('over', pct > 100);
      }
      byId('breakdown').replaceChildren();
      result.steps.forEach((step, i) => {
        const row = element('div', 'breakdown-row'); const head = element('div', 'breakdown-row-head');
        head.append(element('span', 'breakdown-name', step.name), element('span', 'breakdown-value', num(step.expected.tokens)));
        const track = element('div', 'bar-track'); track.setAttribute('aria-hidden', 'true');
        for (const [key, className] of [['input', 'bar-fresh'], ['cached', 'bar-cached'], ['output', 'bar-output']]) {
          const bar = element('span', className); bar.style.width = (result.expected.tokens ? step.expected[key] / result.expected.tokens * 100 : 0) + '%'; track.append(bar);
        }
        row.append(head, track); byId('breakdown').append(row);
        const note = stepContainer.children[i].querySelector('.attempts-note'); note.replaceChildren();
        note.append(element('strong', '', num(step.attempts) + ' expected attempts'), document.createTextNode('Up to ' + step.maxAttempts + ' per run'));
      });
      renumber();
      lastScenario = { format: 'agent-budget-lab-v1', scenario, results: result, assumptions: ['Simulation, not measured performance or a quote.', 'All steps run each workflow with constant token counts per attempt.', 'The same conditional retry chance applies to each bounded retry.', 'Cache hit share applies to reusable input on every attempt including the first.', 'Retry ceiling only bounds retries at the entered token and cache assumptions.', 'Prices are user-entered USD per million tokens; no rates are fetched.', 'No tool fees, media generation, hidden reasoning tokens, taxes or provider billing exceptions are included.'] };
    } catch (error) {
      byId('error').textContent = error.message; byId('error').hidden = false;
      byId('results-title').closest('section').classList.add('invalid-results');
      byId('export').disabled = true; lastScenario = null;
      byId('expected-cost').textContent = 'Check inputs'; byId('expected-tokens').textContent = 'No estimate for the current inputs.';
      byId('worst-cost').textContent = 'Unavailable'; byId('worst-tokens').textContent = '';
      byId('breakdown').replaceChildren();
      for (const id of ['fresh-total', 'cached-total', 'output-total']) byId(id).textContent = 'Unavailable';
      byId('cache-saving').textContent = 'Correct the inputs to calculate a new estimate.'; byId('budget-result').hidden = true;
    }
  }

  function reset() {
    stepContainer.replaceChildren(); example.forEach(addStep);
    byId('runs').value = '100'; byId('cacheHit').value = '0';
    for (const id of ['budget', 'inputPrice', 'cachedPrice', 'outputPrice']) byId(id).value = '';
    update();
  }
  document.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
  stepContainer.addEventListener('input', update);
  byId('add-step').addEventListener('click', () => { addStep({ name: 'New step', fresh: 0, reusable: 0, output: 0, retry: 0, cap: 0 }); update(); });
  byId('reset').addEventListener('click', reset);
  byId('export').addEventListener('click', () => {
    if (!lastScenario) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(lastScenario, null, 2) + '\n'], { type: 'application/json' }));
    const link = element('a'); link.href = url; link.download = 'agent-budget-scenario.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  reset();
})();
