import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

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

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
