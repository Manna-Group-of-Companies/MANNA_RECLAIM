/**
 * Whose line this was.
 *
 * The plant pays an incentive on the figures the chip sits beside, so a card
 * that reports one and cannot say whose it is cannot be paid on. An unnamed line
 * says so rather than leaving a blank, because that is a thing to fix and not a
 * thing to skip past.
 *
 * The three states are deliberately three, not two. `undefined` is a card that
 * is not a line at all - a batch yield belongs to a batch, not to a station, and
 * telling its reader "no operator set" would be inventing a gap for them to go
 * and fill. `null` is a line with nobody on it, which is the real gap.
 */
export function OperatorChip({ operator, where }: { operator?: string | null; where?: string }) {
  if (operator === undefined) return null;
  if (operator) return <span className="effop">{operator}</span>;
  return <span className="effop none">no operator{where ? ` — set on ${where}` : ' set'}</span>;
}

export default OperatorChip;
