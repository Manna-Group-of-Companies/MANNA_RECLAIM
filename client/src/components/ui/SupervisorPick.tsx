import { SelectField } from './Field';
import { useSupervisor } from '@/hooks/useSupervisor';

export interface SupervisorPickProps {
  label?: string;
  note?: string;
  fieldClassName?: string;
}

/**
 * The name this record will be signed with, switchable.
 *
 * Sat where the sheets used to print the signed-in account as a read-only line:
 * the same information, but the crew can correct it when the tablet is signed
 * in as someone other than whoever is on the floor. The pick is shared across
 * the sheets and remembered for the device, so it is switched once a shift.
 */
export function SupervisorPick({
  label = 'Supervisor',
  note = '— signs this record',
  fieldClassName,
}: SupervisorPickProps) {
  const { name, setName, options, isAccount } = useSupervisor();

  return (
    <SelectField
      label={label}
      note={note}
      value={name}
      onChange={(e) => setName(e.target.value)}
      fieldClassName={fieldClassName}
      hint={isAccount ? undefined : 'Switched from the account signed in on this tablet.'}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </SelectField>
  );
}

export default SupervisorPick;
