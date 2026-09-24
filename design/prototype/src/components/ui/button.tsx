import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/src/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const variantClasses = {
      default: "bg-orange-600 text-white hover:bg-orange-500 shadow-sm active:bg-orange-700",
      destructive: "bg-red-600/90 text-white hover:bg-red-600 shadow-sm",
      outline: "border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white",
      secondary: "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-800",
      ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
      link: "text-orange-500 underline-offset-4 hover:underline",
    }[variant];

    const sizeClasses = {
      default: "h-9 px-3.5 py-1.5 text-xs font-medium",
      sm: "h-8 px-2.5 text-xs font-medium",
      lg: "h-10 px-5 text-sm font-medium",
      icon: "h-8 w-8 p-0 flex items-center justify-center shrink-0",
      "icon-sm": "h-7 w-7 p-0 flex items-center justify-center shrink-0",
    }[size];

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none",
          variantClasses,
          sizeClasses,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
