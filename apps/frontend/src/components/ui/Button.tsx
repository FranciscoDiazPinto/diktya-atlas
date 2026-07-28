import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        // navy tiene 13.8:1 sobre blanco (excelente); en modo oscuro navy
        // es casi invisible (1.3:1) así que ahí se mantiene el patrón claro
        // neutro que ya tenía buen contraste, en vez de forzar la marca.
        default: "bg-brand-navy text-white hover:bg-brand-navy-hover dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline:
          "border border-slate-300 bg-transparent hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800",
        ghost: "hover:bg-slate-100 dark:hover:bg-slate-800",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
