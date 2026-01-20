'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, indeterminate, checked, id, ...props }, ref) => {
    const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <label
        htmlFor={checkboxId}
        className={cn(
          'inline-flex items-center cursor-pointer',
          props.disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'w-5 h-5 border-2 rounded transition-colors',
              'peer-focus:ring-2 peer-focus:ring-blue-500 peer-focus:ring-offset-2',
              checked || indeterminate
                ? 'bg-blue-600 border-blue-600'
                : 'bg-white border-gray-300'
            )}
          >
            {(checked || indeterminate) && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                {indeterminate ? (
                  <Minus className="w-3 h-3" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </div>
            )}
          </div>
        </div>
        {label && (
          <span className="ml-2 text-sm text-gray-700">{label}</span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
export type { CheckboxProps };
