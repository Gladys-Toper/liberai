import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "violet"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "link";
  size?: "sm" | "default" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:pointer-events-none disabled:opacity-50";

    const variantStyles = {
      default:
        "bg-[#8b5cf6] text-[#fafafa] hover:bg-[#a78bfa] active:bg-[#7c3aed]",
      violet:
        "bg-[#8b5cf6] text-[#fafafa] hover:bg-[#a78bfa] active:bg-[#7c3aed]",
      secondary:
        "bg-[#27272a] text-[#fafafa] hover:bg-[#3f3f46] active:bg-[#52525b]",
      outline:
        "border border-[#27272a] bg-transparent text-[#fafafa] hover:bg-[#141414] hover:border-[#52525b] active:bg-[#27272a]",
      ghost:
        "text-[#fafafa] hover:bg-[#27272a] active:bg-[#3f3f46] data-[state=open]:bg-[#27272a]",
      destructive:
        "bg-[#ef4444] text-[#fafafa] hover:bg-[#f87171] active:bg-[#dc2626]",
      link: "text-[#8b5cf6] underline-offset-4 hover:underline",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-2",
      default: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-base gap-2",
      icon: "h-10 w-10",
    };

    return (
      <button
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || isLoading}
        ref={ref}
        {...props}
      >
        {isLoading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
