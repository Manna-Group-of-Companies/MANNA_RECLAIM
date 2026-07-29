import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface FieldShellProps {
  label?: ReactNode;
  /** Small grey aside on the label line - "opt.", "blank = now"... */
  note?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}

function FieldShell({ label, note, hint, className, children, htmlFor }: FieldShellProps) {
  return (
    <div className={cn('field', className)}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {note && <span className="muted normal-case tracking-normal"> {note}</span>}
        </label>
      )}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  note?: ReactNode;
  hint?: ReactNode;
  /** Unit printed inside the box on the right (kg, °C, kWh). */
  suffix?: string;
  fieldClassName?: string;
}

export function TextField({ label, note, hint, suffix, fieldClassName, className, ...rest }: TextFieldProps) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell label={label} note={note} hint={hint} className={fieldClassName} htmlFor={id}>
      {suffix ? (
        <div className="num-suffix">
          <input {...rest} id={id} className={className} />
          <span className="sfx">{suffix}</span>
        </div>
      ) : (
        <input {...rest} id={id} className={className} />
      )}
    </FieldShell>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  note?: ReactNode;
  hint?: ReactNode;
  fieldClassName?: string;
}

export function SelectField({ label, note, hint, fieldClassName, children, ...rest }: SelectFieldProps) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell label={label} note={note} hint={hint} className={fieldClassName} htmlFor={id}>
      <select {...rest} id={id}>
        {children}
      </select>
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  note?: ReactNode;
  hint?: ReactNode;
  fieldClassName?: string;
}

export function TextAreaField({ label, note, hint, fieldClassName, ...rest }: TextAreaFieldProps) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell label={label} note={note} hint={hint} className={fieldClassName} htmlFor={id}>
      <textarea {...rest} id={id} />
    </FieldShell>
  );
}

/** Two fields side by side, as `.field-inline` in the prototype. */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('field-inline', className)}>{children}</div>;
}

/** Red inline validation block above the sheet actions. */
export function FormWarning({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className="formwarn show">{children}</div>;
}

export default TextField;
