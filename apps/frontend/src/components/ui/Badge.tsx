import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn.js";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
      info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
