import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-[3px] border border-[var(--border)] bg-transparent px-2.5 py-1 text-[14px] font-normal text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/60 focus-visible:ring-1 focus-visible:ring-[var(--ink)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
