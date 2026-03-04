import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  size?: "sm" | "default" | "lg";
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, size = "default", ...props }, ref) => {
    const sizeStyles = {
      sm: "h-1",
      default: "h-2",
      lg: "h-3",
    };

    const clampedValue = Math.min(Math.max(value, 0), 100);

    return (
      <div
        ref={ref}
        className={cn(
          "w-full overflow-hidden rounded-full bg-[#27272a]",
          sizeStyles[size],
          className
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedValue}
        {...props}
      >
        <div
          className="h-full bg-[#8b5cf6] transition-all duration-300 ease-out"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    );
  }
);

Progress.displayName = "Progress";

export { Progress };
