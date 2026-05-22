import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-accent text-bg active:bg-accent/90",
        secondary:
          "border border-border bg-surface text-text-primary active:bg-surface-elevated",
        ghost: "text-text-secondary active:bg-surface",
        danger: "bg-danger text-text-primary active:bg-danger/90",
      },
      size: {
        // Mobile defaults — never below 44pt on touch surfaces.
        default: "h-11 px-5 rounded-[8px] text-[16px]",
        sm: "h-9 px-3 rounded-[8px] text-[14px]",
        lg: "h-12 px-6 rounded-[8px] text-[16px]",
        icon: "h-11 w-11 rounded-[8px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
