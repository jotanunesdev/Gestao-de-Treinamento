import styles from "./button.module.css"
import type { MouseEventHandler, ReactNode } from "react"

type ButtonProps = {
    type?: "button" | "submit" | "reset",
    onClick?: MouseEventHandler<HTMLButtonElement>,
    text?: string,
    children?: ReactNode,
    isLoading?: boolean,
    disabled?: boolean,
    variant?: "primary" | "secondary" | "ghost" | "danger",
    size?: "sm" | "md" | "lg",
    fullWidth?: boolean,
    className?: string,
}

const Button = ({
  type = "button",
  onClick,
  text,
  children,
  isLoading = false,
  disabled = false,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonProps) => {
  const isDisabled = disabled || isLoading
  const content = children ?? text

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      type={type}
      aria-busy={isLoading || undefined}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${
        fullWidth ? styles.fullWidth : ""
      } ${isLoading ? styles.loading : ""} ${className ?? ""}`}
    >
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {content ? <span className={styles.label}>{content}</span> : null}
    </button>
  )
}

export default Button
