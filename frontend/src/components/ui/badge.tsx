import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        gray: "bg-gray-200 text-secondary-foreground [a]:hover:bg-gray-300",
        teal: "bg-teal-200 text-teal-900 [a]:hover:bg-teal-300",
        sky: "bg-sky-200 text-sky-900 [a]:hover:bg-sky-300",
        yellow: "bg-yellow-200 text-yellow-900 [a]:hover:bg-yellow-300",
        indigo: "bg-indigo-200 text-indigo-900 [a]:hover:bg-indigo-300",
        green: "bg-green-200 text-green-900 [a]:hover:bg-green-300",
        orange: "bg-orange-200 text-orange-900 [a]:hover:bg-orange-300",
        red: "bg-red-200 text-red-900 [a]:hover:bg-red-300",
        indigo900: "bg-indigo-900 text-white [a]:hover:bg-indigo-800",
        muted: "bg-muted text-muted-foreground [a]:hover:bg-muted/80",
        notification: "bg-indigo-500/20 text-indigo-900 focus-visible:ring-indigo/20 dark:focus-visible:ring-indigo/40 [a]:hover:bg-indigo-500/20",
      },

      size: {
        sm: "h-5 px-1.5 text-xs",
        default: "h-6 px-2 text-xs",
        lg: "h-7 px-2.5 text-sm",
      },
    },

    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          badgeVariants({
            variant,
            size,
          }),
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
      size,
    },
  });
}

export { Badge, badgeVariants };