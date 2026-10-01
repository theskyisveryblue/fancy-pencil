import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';

export interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  disabled?: boolean;
  testId?: string;
  title?: string;
}

export function NumberField({ label, value, onCommit, disabled, testId, title }: NumberFieldProps) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    setText(value === undefined ? '' : String(value));
  }, [value]);

  const commit = (): void => {
    const parsed = Number.parseFloat(text);
    if (Number.isFinite(parsed)) {
      onCommit(parsed);
    } else {
      setText(value === undefined ? '' : String(value));
    }
  };

  return (
    <label className="field mono" title={title}>
      <span className="field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export interface SizeFieldProps {
  label: string;
  value: number | string | undefined;
  onCommit: (value: number | string) => void;
  disabled?: boolean;
  testId?: string;
}

export function SizeField({ label, value, onCommit, disabled, testId }: SizeFieldProps) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    setText(value === undefined ? '' : String(value));
  }, [value]);

  const commit = (): void => {
    const trimmed = text.trim();
    if (/^fill_container/.test(trimmed)) {
      onCommit('fill_container');
      return;
    }
    if (/^(fit_content|hug)$/i.test(trimmed)) {
      onCommit('fit_content');
      return;
    }
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) {
      onCommit(parsed);
    } else {
      setText(value === undefined ? '' : String(value));
    }
  };

  return (
    <label className="field mono">
      <span className="field-label">{label}</span>
      <input
        type="text"
        value={text}
        disabled={disabled}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  testId?: string;
  wide?: boolean;
}

export function TextField({ label, value, onCommit, testId, wide }: TextFieldProps) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span className="field-label">{label}</span>
      <input
        type="text"
        value={text}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export interface TextAreaFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  testId?: string;
}

export function TextAreaField({ label, value, onCommit, testId }: TextAreaFieldProps) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <label className="field field-wide" style={{ height: 'auto', paddingTop: 4, paddingBottom: 4 }}>
      <span className="field-label">{label}</span>
      <textarea
        rows={2}
        value={text}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
        onBlur={() => onCommit(text)}
      />
    </label>
  );
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onCommit: (value: string) => void;
  testId?: string;
}

export function SelectField({ label, value, options, onCommit, testId }: SelectFieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={value}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onCommit(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
  title?: string;
}

export function CheckboxField({ label, checked, onChange, testId, title }: CheckboxFieldProps) {
  return (
    <label title={title}>
      <input
        type="checkbox"
        checked={checked}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export interface ColorFieldProps {
  label: string;
  value: string;
  resolved: string | null;
  onCommit: (value: string) => void;
  testId?: string;
}

const UNRESOLVED_SWATCH = 'repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 4px, #f9fafb 4px, #f9fafb 8px)';
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;

function pickerValueFrom(resolved: string | null): string | null {
  if (typeof resolved !== 'string') return null;
  const trimmed = resolved.trim();
  if (HEX6.test(trimmed)) return trimmed;
  const short = HEX3.exec(trimmed);
  if (short) return '#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3];
  return null;
}

export function ColorField({ label, value, resolved, onCommit, testId }: ColorFieldProps) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  // The text field stays bound to the raw source so a variable reference
  // survives selection, theme changes and save. Only the swatch and the native
  // preview use the resolved layout color; an unresolvable reference is shown
  // as an explicit unresolved pattern instead of a misleading black swatch.
  const resolvedText = typeof resolved === 'string' && resolved.trim() !== '' ? resolved.trim() : null;
  const pickerValue = pickerValueFrom(resolvedText);

  return (
    <label className="field field-wide">
      <span className="field-label">{label}</span>
      <span
        className="swatch"
        data-testid={testId ? testId + '-swatch' : undefined}
        data-resolved={resolvedText ? 'true' : 'false'}
        data-resolved-color={resolvedText ?? ''}
        title={resolvedText ? 'Resolved color ' + resolvedText : 'Unresolved color value: ' + value}
        style={resolvedText ? { background: resolvedText } : { backgroundImage: UNRESOLVED_SWATCH }}
      />
      <input
        type="color"
        aria-label={label + ' color picker'}
        data-testid={testId ? testId + '-picker' : undefined}
        data-resolved={pickerValue ? 'true' : 'false'}
        value={pickerValue ?? '#000000'}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onCommit(event.target.value)}
        style={{ width: 22, flex: '0 0 auto' }}
      />
      <input
        type="text"
        value={text}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  testId?: string;
  title?: string;
}

export function IconButton({ label, onClick, children, pressed, disabled, testId, title }: IconButtonProps) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={title ?? label}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
