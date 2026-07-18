import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
};

export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("ui-separator", `ui-separator--${orientation}`, className)}
      {...props}
    />
  );
}
