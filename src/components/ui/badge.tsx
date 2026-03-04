import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default:
        "bg-[#8b5cf6] text-[#fafafa]",
      secondary:
        "bg-[#27272a] text-[#fafafa]",
      outline:
        "border border-[#27272a] text-[#fafafa] bg-transparent",
      success:
        "bg-[#22c55e] text-[#fafafa]",
      warning:
        "bg-[#f59e0b] text-[#fafafa]",
      destructive:
        "bg-[#ef4444] text-[#fafafa]",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
          variantStyles[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
