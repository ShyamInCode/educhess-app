import React from "react";
import { cn } from "../../lib/utils";

const Label = React.forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn("text-sm font-mono text-ink-dim uppercase tracking-wide", className)}
      {...props}
    />
  );
});

export { Label };
