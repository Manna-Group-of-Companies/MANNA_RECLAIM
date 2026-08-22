import test from 'node:test';
import assert from 'node:assert/strict';
import { bearingSpec } from '../src/services/maintenance.service.js';

/**
 * The Soorya Grinder, which is a grinder with nothing on it.
 *
 * No electricity meter, no hour meter, and nothing on the greasing schedule. It
 * is weighed at the end of a shift and that is the whole of what the crew
 * records against it - but it is `kind: 'grind'` like the other two, so
 * everything that reads the kind asked it for readings that do not exist.
 *
 * Two separate facts, deliberately two columns. A machine can have bearings and
 * no meters, or meters and no bearings, and one column answering both would be
 * one fact wearing two names. Null on either means nobody has said, so the kind
 * goes on answering - which is every other machine on the plant.
 *
 * The cost of getting this wrong is not a stray form field. A machine that has
 * never had its temperatures logged counts as due, so Soorya sat permanently
 * overdue on the shop floor's Bearing tab and on the manager's dashboard, asking
 * for four temperatures nobody was ever going to take. A prompt that is always
 * red is a prompt the crew learns to scroll past - including on the machines
 * where it means something.
 */

const grinder = (over = {}) => ({
  id: 'GRD_S',
  name: 'Grinder 2',
  kind: 'grind',
  enabled: true,
  ...over,
});

test('a machine marked as having no bearings is off the greasing schedule', () => {
  const soorya = grinder({ id: 'GRD_O', name: 'Soorya Grinder', bearings: false });
  assert.equal(bearingSpec(soorya), null, 'Soorya is never asked for temperatures');
});

test('and every other grinder still is', () => {
  const spec = bearingSpec(grinder());
  assert.ok(spec, 'Grinder 2 keeps its schedule');
  assert.equal(spec.intervalH, 2, 'grinders are checked every two hours');
  assert.equal(spec.positions.length, 4);
});

test('null is "nobody has said", not "no"', () => {
  // Every machine on the plant but one. If null read as false, a single
  // migration adding the column would silently empty the Bearing tab.
  for (const bearings of [null, undefined]) {
    assert.ok(bearingSpec(grinder({ bearings })), `bearings: ${bearings} falls back to the kind`);
  }
});

test('the kinds that never had bearings are unaffected either way', () => {
  for (const kind of ['autoclave', 'press']) {
    assert.equal(bearingSpec(grinder({ kind })), null);
    assert.equal(bearingSpec(grinder({ kind, bearings: true })), null, 'kind still wins here');
  }
});

test('a bush machine stays a bush machine', () => {
  // The four that run on bushes rather than bearings. Worth pinning beside the
  // above, because both answers come out of the same function and a change to
  // one of them is one line away from the other.
  assert.equal(bearingSpec(grinder({ id: 'GRD_K' })).type, 'bush');
  assert.equal(bearingSpec(grinder({ id: 'GRD_S' })).type, 'bearing');
});
