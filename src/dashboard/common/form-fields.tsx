import React from 'react';
import type { ComponentProps } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export type ControlledInputControlProps<TValues extends FieldValues> = Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'defaultValue' | 'onChange'> & {
  control: Control<TValues>;
  name: Path<TValues>;
};

export type ControlledInputFieldProps<TValues extends FieldValues> = ControlledInputControlProps<TValues> & {
  label: string;
  inputId?: string;
};

export type ControlledInputFieldDescriptor<TValues extends FieldValues> = Omit<ControlledInputFieldProps<TValues>, 'control'> & {
  id?: string;
  visible?: boolean;
};

export function ControlledInputControl<TValues extends FieldValues>({ control, name, ...props }: ControlledInputControlProps<TValues>) {
  return (
    <Controller name={name} control={control} render={({ field }) => {
      const value = typeof field.value === 'string' || typeof field.value === 'number' ? field.value : '';
      return <Input {...props} {...field} value={value} />;
    }} />
  );
}

export function ControlledInputField<TValues extends FieldValues>({ control, name, label, inputId, ...props }: ControlledInputFieldProps<TValues>) {
  const id = inputId || fieldId(name);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <ControlledInputControl control={control} name={name} {...props} id={id} />
    </div>
  );
}

export function ControlledInputFieldList<TValues extends FieldValues>({ control, fields }: {
  control: Control<TValues>;
  fields: readonly ControlledInputFieldDescriptor<TValues>[];
}) {
  return (
    <>
      {fields.map((field) => {
        const { id, visible, ...props } = field;
        if (visible === false) return null;
        return <ControlledInputField key={id ?? String(field.name)} control={control} {...props} />;
      })}
    </>
  );
}

type ControlledTextareaFieldProps<TValues extends FieldValues> = Omit<ComponentProps<typeof Textarea>, 'name' | 'value' | 'defaultValue' | 'onChange'> & {
  control: Control<TValues>;
  name: Path<TValues>;
  label?: string;
  inputId?: string;
};

export function ControlledTextareaField<TValues extends FieldValues>({ control, name, label, inputId, ...props }: ControlledTextareaFieldProps<TValues>) {
  const id = inputId || fieldId(name);
  return (
    <Controller name={name} control={control} render={({ field }) => {
      const value = typeof field.value === 'string' || typeof field.value === 'number' ? String(field.value) : '';
      const textarea = <Textarea {...props} {...field} id={id} value={value} />;
      if (!label) return textarea;
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          {textarea}
        </div>
      );
    }} />
  );
}

export type SelectFieldOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type ControlledSelectFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  name: Path<TValues>;
  options: readonly SelectFieldOption[];
  inputId?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  parseValue?: (value: string) => unknown;
};

export function ControlledSelectField<TValues extends FieldValues>({
  control,
  name,
  options,
  inputId,
  label,
  placeholder,
  value,
  parseValue,
}: ControlledSelectFieldProps<TValues>) {
  const id = inputId || fieldId(name);
  return (
    <Controller name={name} control={control} render={({ field }) => {
      const selectedValue = value ?? String(field.value ?? '');
      const select = (
        <Select value={selectedValue} onValueChange={(next) => field.onChange(parseValue ? parseValue(next) : next)}>
          <SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      if (!label) return select;
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          {select}
        </div>
      );
    }} />
  );
}

function fieldId(name: string) {
  return `field-${String(name).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
