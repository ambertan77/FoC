import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Spinner } from './spinner';

interface ButtonProps extends ButtonPrimitive.Props,
  VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
        indigo: 'bg-indigo-900 text-white hover:bg-indigo-800 focus-visible:ring-indigo-400',
        linkIndigo: 'text-indigo-500 underline-offset-4 underline cursor-pointer hover:text-indigo-700 focus-visible:ring-indigo-400',
        input:
          'border-border bg-transparent hover:bg-background hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        teal: 'bg-teal-200 text-teal-900 hover:bg-teal-300 focus-visible:ring-teal-400',
        sky: 'bg-sky-200 text-sky-900 hover:bg-sky-300 focus-visible:ring-sky-400',
        yellow: 'bg-yellow-200 text-yellow-900 hover:bg-yellow-300 focus-visible:ring-yellow-400',
        indigo200: 'bg-indigo-200 text-indigo-900 hover:bg-indigo-300 focus-visible:ring-indigo-400',
        green: 'bg-green-200 text-green-900 hover:bg-green-300 focus-visible:ring-green-400',
        orange: 'bg-orange-200 text-orange-900 hover:bg-orange-300 focus-visible:ring-orange-400',
        red: 'bg-red-200 text-red-900 hover:bg-red-300 focus-visible:ring-red-400',
        gray: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus-visible:ring-gray-400',
        cyan: 'bg-cyan-200 text-cyan-900 hover:bg-cyan-300 focus-visible:ring-cyan-400',
        pink: 'bg-pink-200 text-pink-900 hover:bg-pink-300 focus-visible:ring-pink-400',
        darkGreen: 'bg-green-800 text-green-100 hover:bg-green-900 focus-visible:ring-green-900',
        darkRed: 'bg-red-800 text-red-100 hover:bg-red-900 focus-visible:ring-red-900',
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
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
  isLoading = false,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={props.disabled || isLoading}
      {...props}
    >
      {isLoading && (<Spinner />)}
      {props.children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants, type ButtonProps };
