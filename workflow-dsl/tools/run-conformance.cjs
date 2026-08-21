#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const validation = JSON.parse(fs.readFileSync(path.join(root, pkg.documents.validation), 'utf8'));
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function classify(input) {
  if (input.outcome === 'branch') {
    if (!input.branches.includes(input.returnedBranch)) {
      if (input.budgetRemaining > 0) return { trace: [{ event: 'retry-scheduled', reason: 'out-of-set' }], oracle: { disposition: 'RETRY' } };
      return { trace: [{ event: 'budget-exhausted', reason: 'out-of-set' }], oracle: { disposition: 'INCOMPLETE' } };
    }
    return { trace: [{ event: 'classification-selected', branch: input.returnedBranch }], oracle: { disposition: 'BRANCH', branch: input.returnedBranch } };
  }
  if (input.outcome === 'fallback') return { trace: [{ event: 'fallback-selected' }], oracle: { disposition: 'FALLBACK' } };
  if (input.outcome === 'nonretryable-failure') return { trace: [{ event: 'failed', reason: 'nonretryable' }], oracle: { disposition: 'FAILED' } };
  if (input.budgetRemaining > 0) return { trace: [{ event: 'retry-scheduled' }], oracle: { disposition: 'RETRY' } };
  return { trace: [{ event: 'budget-exhausted' }], oracle: { disposition: 'INCOMPLETE' } };
}

function correlateWait(input) {
  if (input.duplicate) return { trace: [{ event: 'wait-rejected', reason: 'duplicate' }], oracle: { disposition: 'WAIT_PENDING' } };
  if (input.pendingId !== input.answerId) return { trace: [{ event: 'wait-rejected', reason: 'correlation-mismatch' }], oracle: { disposition: 'WAIT_PENDING' } };
  return { trace: [{ event: 'wait-resumed' }], oracle: { disposition: 'RESUMED' } };
}

function reduce(input) {
  const fail = reason => ({ trace: [{ event: 'reducer-failed', reason }], oracle: { disposition: 'FAILED' } });
  const values = input.payloads;
  if (['sum', 'min', 'max'].includes(input.operator)) {
    if (!values.every(Number.isSafeInteger)) return fail('invalid-safe-integer');
    let output = values[0];
    for (const value of values.slice(1)) {
      if (input.operator === 'sum') {
        output += value;
        if (!Number.isSafeInteger(output) || Math.abs(output) > MAX_SAFE) return fail('safe-integer-overflow');
      } else if (input.operator === 'min') output = Math.min(output, value);
      else output = Math.max(output, value);
    }
    return { trace: [{ event: 'reducer-output' }], oracle: { disposition: 'JOINED', output } };
  }
  if (['all', 'any'].includes(input.operator)) {
    if (!values.every(value => typeof value === 'boolean')) return fail('invalid-boolean');
    const output = input.operator === 'all' ? values.every(Boolean) : values.some(Boolean);
    return { trace: [{ event: 'reducer-output' }], oracle: { disposition: 'JOINED', output } };
  }
  if (!values.every(Array.isArray)) return fail('invalid-scalar-array');
  const output = [];
  const seen = new Set();
  for (const array of values) {
    for (const value of array) {
      if (value === null || ['object', 'undefined'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value))) return fail('invalid-scalar-array');
      const key = `${typeof value}:${JSON.stringify(value)}`;
      if (!seen.has(key)) { seen.add(key); output.push(value); }
    }
  }
  return { trace: [{ event: 'reducer-output' }], oracle: { disposition: 'JOINED', output } };
}

function execute(input) {
  if (input.operation === 'planner-classification') return classify(input);
  if (input.operation === 'wait-correlation') return correlateWait(input);
  if (input.operation === 'reducer') return reduce(input);
  throw new Error(`unsupported fixture operation: ${input.operation}`);
}

const counts = { positive: 0, negative: 0, recovery: 0 };
for (const fixture of validation.conformance) {
  const actual = execute(fixture.input);
  assert.deepStrictEqual(actual.trace, fixture.trace, `${fixture.id}: trace mismatch`);
  assert.deepStrictEqual(actual.oracle, fixture.oracle, `${fixture.id}: oracle mismatch`);
  counts[fixture.class] += 1;
}
for (const required of Object.keys(counts)) assert.ok(counts[required] > 0, `missing ${required} fixture`);
console.log(`PASS executable corpus: positive=${counts.positive} negative=${counts.negative} recovery=${counts.recovery}`);

module.exports = { classify, correlateWait, reduce };
