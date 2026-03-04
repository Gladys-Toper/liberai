import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, type = "text", ...props }, ref) => {
    return (
      <div className="flex w-full flex-col gap-2">
        {label && (
          <label className="text-sm font-medium text-[#fafafa]">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-[#27272a] bg-[#141414] px-4 py-2 text-sm text-[#fafafa] placeholder:text-[#71717a] transition-colors focus-visible:outline-none focus-visible:border-[#8b5cf6] focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-[#ef4444] focus-visible:border-[#ef4444] focus-visible:ring-[#ef4444]",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <span className="text-xs text-[#ef4444]">{error}</span>}
        {helperText && !error && (
          <span className="text-xs text-[#71717a]">{helperText}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
