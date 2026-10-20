import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg shadow-card hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-fg-2 shadow-card hover:bg-surface-2 hover:text-fg",
  ghost: "text-fg-2 hover:bg-surface-3 hover:text-fg",
  danger: "border border-danger-line bg-surface text-danger shadow-card hover:bg-danger-soft",
  link: "text-left !whitespace-normal text-primary-text underline-offset-2 hover:underline",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-sm",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = "") {
  return cn(base, variants[variant], variant === "link" ? "h-auto px-0 text-sm" : sizes[size], extra);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName; iconRight?: IconName; children?: ReactNode };

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: Common & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={size === "sm" ? 13 : 15} /> : icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  className = "",
  children,
  ...rest
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </Link>
  );
}

// A button with only an icon: always has a label for screen readers and a
// tooltip for everyone else.
export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  className = "",
  type = "button",
  ...rest
}: { icon: IconName; label: string; size?: ButtonSize; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(buttonClass(variant, size), size === "sm" ? "w-8 px-0" : "w-9 px-0", className)}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 15 : 17} />
    </button>
  );
}
