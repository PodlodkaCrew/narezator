import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-[3px] border-2 border-[#171717] bg-[#fffdf7] px-2.5 py-1 text-base font-semibold text-[#171717] shadow-[2px_2px_0_#171717] outline-none placeholder:text-[#171717]/45 focus-visible:ring-2 focus-visible:ring-[#171717] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
