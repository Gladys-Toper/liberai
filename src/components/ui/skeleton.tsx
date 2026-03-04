import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "h-12 w-full rounded-md bg-gradient-to-r from-[#141414] via-[#27272a] to-[#141414] bg-[length:200%_100%] animate-shimmer",
        className
      )}
      {...props}
    />
  )
);

Skeleton.displayName = "Skeleton";

export { Skeleton };
