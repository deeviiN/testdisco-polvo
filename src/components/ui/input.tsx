import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, style, autoCapitalize, autoCorrect, spellCheck, ...props }, ref) => {
    const isEmail = type === "email";
    const handleChange = isEmail && onChange
      ? (e: React.ChangeEvent<HTMLInputElement>) => {
          const lowered = e.target.value.toLowerCase();
          if (e.target.value !== lowered) e.target.value = lowered;
          onChange(e);
        }
      : onChange;
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        style={isEmail ? { textTransform: "lowercase", ...(style || {}) } : style}
        autoCapitalize={isEmail ? "none" : autoCapitalize}
        autoCorrect={isEmail ? "off" : autoCorrect}
        spellCheck={isEmail ? false : spellCheck}
        onChange={handleChange}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
