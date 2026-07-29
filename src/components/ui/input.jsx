import React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef(function Input({ className, type, ...props }, ref) {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "w-full bg-void border border-line rounded-lg px-3 py-2.5 text-base text-ink placeholder:text-ink-dim focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});

export { Input };
