import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal" | "both";
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden",
        orientation === "vertical" && "overflow-y-auto",
        orientation === "horizontal" && "overflow-x-auto",
        orientation === "both" && "overflow-auto",
        className
      )}
      {...props}
    />
  )
);

ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
