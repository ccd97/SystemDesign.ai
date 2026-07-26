import { forwardRef, type InputHTMLAttributes } from "react";

function cx(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cx("ui-input", className)} {...props} />
  ),
);

Input.displayName = "Input";
