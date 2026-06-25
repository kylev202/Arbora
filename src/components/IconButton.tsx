import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./IconButton.module.css";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only controls must name themselves for screen readers. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  variant?: "ghost" | "surface";
};

/** Square, icon-only control. `label` becomes aria-label + tooltip title. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "md", variant = "ghost", className, type, ...rest },
  ref,
) {
  const classes = [styles.iconButton, styles[size], styles[variant], className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      aria-label={label}
      title={label}
      {...rest}
    >
      <span aria-hidden="true" className={styles.glyph}>
        {icon}
      </span>
    </button>
  );
});
