import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = React.createContext<
  DropdownMenuContextType | undefined
>(undefined);

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error("useDropdownMenu must be used within DropdownMenu");
  }
  return context;
}

export interface DropdownMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const DropdownMenu = React.forwardRef<HTMLDivElement, DropdownMenuProps>(
  ({ open: controlledOpen, onOpenChange, children }, ref) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);

    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = React.useCallback(
      (newOpen: boolean) => {
        if (controlledOpen === undefined) {
          setUncontrolledOpen(newOpen);
        }
        onOpenChange?.(newOpen);
      },
      [controlledOpen, onOpenChange]
    );

    // Close on click outside — use 'click' (not 'mousedown') for Safari compat
    React.useEffect(() => {
      if (!open) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setOpen(false);
        }
      };

      // Use setTimeout so the current click event finishes before we listen
      const id = setTimeout(() => {
        document.addEventListener("click", handleClickOutside, true);
      }, 0);

      return () => {
        clearTimeout(id);
        document.removeEventListener("click", handleClickOutside, true);
      };
    }, [open, setOpen]);

    // Escape key
    React.useEffect(() => {
      if (!open) return;

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [open, setOpen]);

    return (
      <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
        <div ref={containerRef} className="relative">
          {children}
        </div>
      </DropdownMenuContext.Provider>
    );
  }
);

DropdownMenu.displayName = "DropdownMenu";

export interface DropdownMenuTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ onClick, children, asChild, ...props }, ref) => {
  const { setOpen, open, triggerRef } = useDropdownMenu();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setOpen(!open);
    onClick?.(e);
  };

  // Merge refs
  const mergedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current =
        node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [ref, triggerRef]
  );

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
    });
  }

  return (
    <button ref={mergedRef} type="button" onClick={handleClick} {...props}>
      {children}
    </button>
  );
});

DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export interface DropdownMenuContentProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(({ className, children, ...props }, ref) => {
  const { open } = useDropdownMenu();

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-0 top-full mt-1 z-[60] min-w-[8rem] overflow-hidden rounded-md border border-[#27272a] bg-[#141414] py-1 shadow-md animate-fade-in",
        className
      )}
      role="menu"
      {...props}
    >
      {children}
    </div>
  );
});

DropdownMenuContent.displayName = "DropdownMenuContent";

export interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
}

const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(({ className, destructive, onClick, children, ...props }, ref) => {
  const { setOpen } = useDropdownMenu();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(false);
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 px-4 py-2 text-sm outline-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-[#ef4444] hover:bg-[#ef4444]/10"
          : "text-[#fafafa] hover:bg-[#27272a]",
        className
      )}
      role="menuitem"
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
});

DropdownMenuItem.displayName = "DropdownMenuItem";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
