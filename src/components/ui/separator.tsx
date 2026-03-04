import * as React from "react";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-[#27272a]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      role="separator"
      {...props}
    />
  )
);

Separator.displayName = "Separator";

export { Separator };
