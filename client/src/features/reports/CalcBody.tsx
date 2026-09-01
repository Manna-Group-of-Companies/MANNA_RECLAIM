import type { EfficiencyMetric } from '@/types/models';

/**
 * The arithmetic behind a figure, spelled out.
 *
 * One component for both screens on purpose. The back office draws it in a
 * modal and the shop floor in a bottom sheet - they have to, since `.calc` and
 * nearly every class around it are declared under `.back-office` - but what is
 * inside must be the same words in the same order. The plant pays an incentive
 * on these figures, and a supervisor and a manager reading two different
 * workings of one number is an argument neither of them can win.
 *
 * `.calc` itself is back-office-only styling, so the sheet passes its own class.
 */
export function CalcBody({
  calc,
  className = 'calc',
}: {
  calc: NonNullable<EfficiencyMetric['calc']>;
  className?: string;
}) {
  return (
    <>
      <div className={className}>
        <div>
          <b>Formula:</b> {calc.formula}
        </div>
        {calc.lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div>
          = <b className="res">{calc.result}</b>
        </div>
      </div>
      {calc.note && <div className="sub mt-3">{calc.note}</div>}
    </>
  );
}

export default CalcBody;
