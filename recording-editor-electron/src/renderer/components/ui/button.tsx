import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] border-2 border-[#171717] text-sm font-bold text-[#171717] outline-none transition-[transform,box-shadow,background-color] select-none focus-visible:ring-2 focus-visible:ring-[#171717] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-[#c7f464] shadow-[3px_3px_0_#171717] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#171717] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        outline:
          'bg-[#fffdf7] shadow-[3px_3px_0_#171717] hover:bg-[#ffd84d] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#171717] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        secondary:
          'bg-[#6ee7f9] shadow-[3px_3px_0_#171717] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#171717] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        ghost:
          'border-transparent bg-transparent shadow-none hover:border-[#171717] hover:bg-[#fffdf7]',
        destructive:
          'bg-[#ff6b6b] shadow-[3px_3px_0_#171717] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#171717] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
