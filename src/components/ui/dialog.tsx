import * as React from "react";
import { cn } from "@/lib/utils";

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType | undefined>(
  undefined
);

function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within Dialog");
  }
  return context;
}

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ open: controlledOpen, onOpenChange, children }, ref) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);

    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = (newOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    };

    return (
      <DialogContext.Provider value={{ open, setOpen }}>
        <div ref={ref}>{children}</div>
      </DialogContext.Provider>
    );
  }
);

Dialog.displayName = "Dialog";

export interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ onClick, children, asChild, ...props }, ref) => {
    const { setOpen } = useDialog();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      setOpen(true);
      onClick?.(e);
    };

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        onClick: handleClick,
      });
    }

    return (
      <button ref={ref} onClick={handleClick} {...props}>
        {children}
      </button>
    );
  }
);

DialogTrigger.displayName = "DialogTrigger";

export interface DialogContentProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useDialog();
    const dialogRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      };

      const handleBackdropClick = (e: MouseEvent) => {
        if (dialogRef.current === e.target) {
          setOpen(false);
        }
      };

      if (open) {
        document.addEventListener("keydown", handleEscape);
        dialogRef.current?.addEventListener("click", handleBackdropClick);
      }

      return () => {
        document.removeEventListener("keydown", handleEscape);
        dialogRef.current?.removeEventListener("click", handleBackdropClick);
      };
    }, [open, setOpen]);

    if (!open) return null;

    return (
      <div
        ref={dialogRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      >
        <div
          ref={ref}
          className={cn(
            "relative w-full max-w-lg rounded-lg border border-[#27272a] bg-[#141414] shadow-lg animate-fade-in",
            className
          )}
          {...props}
        >
          {children}
          <button
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-md text-[#71717a] hover:text-[#fafafa] transition-colors"
            aria-label="Close"
          >
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }
);

DialogContent.displayName = "DialogContent";

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-2 border-b border-[#27272a] p-6 pb-4", className)}
    {...props}
  />
));

DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-[#fafafa]",
      className
    )}
    {...props}
  />
));

DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[#71717a]", className)}
    {...props}
  />
));

DialogDescription.displayName = "DialogDescription";

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex gap-2 border-t border-[#27272a] p-6 pt-4", className)}
    {...props}
  />
));

DialogFooter.displayName = "DialogFooter";

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
