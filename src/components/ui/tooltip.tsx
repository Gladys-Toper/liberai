import * as React from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  content?: string;
  side?: "top" | "right" | "bottom" | "left";
}

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  ({ className, content, side = "top", children, ...props }, ref) => {
    const [isVisible, setIsVisible] = React.useState(false);

    const sideStyles = {
      top: "bottom-full mb-2",
      right: "left-full ml-2",
      bottom: "top-full mt-2",
      left: "right-full mr-2",
    };

    return (
      <div
        ref={ref}
        className={cn("group relative inline-block", className)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        {...props}
      >
        {children}
        {content && isVisible && (
          <div
            className={cn(
              "absolute z-50 whitespace-nowrap rounded-md bg-[#27272a] px-3 py-1 text-xs text-[#fafafa] shadow-md border border-[#3f3f46] pointer-events-none animate-fade-in",
              sideStyles[side],
              side === "top" || side === "bottom" ? "left-1/2 -translate-x-1/2" : "",
              side === "left" || side === "right" ? "top-1/2 -translate-y-1/2" : ""
            )}
          >
            {content}
            <div
              className={cn(
                "absolute w-2 h-2 bg-[#27272a] border-[#3f3f46]",
                side === "top" && "top-full left-1/2 -translate-x-1/2 -translate-y-1/2 border-t border-r",
                side === "bottom" && "bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 border-b border-l",
                side === "left" && "left-full top-1/2 translate-x-1/2 -translate-y-1/2 border-l border-t",
                side === "right" && "right-full top-1/2 -translate-x-1/2 -translate-y-1/2 border-r border-b"
              )}
            />
          </div>
        )}
      </div>
    );
  }
);

Tooltip.displayName = "Tooltip";

export { Tooltip };
