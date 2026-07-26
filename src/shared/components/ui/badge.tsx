import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

const badgeVariants = cva("ui-badge", {
  variants: {
    variant: {
      default: "ui-badge--default",
      secondary: "ui-badge--secondary",
      outline: "ui-badge--outline",
      destructive: "ui-badge--destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function cx(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cx(badgeVariants({ variant }), className)} {...props} />;
}
