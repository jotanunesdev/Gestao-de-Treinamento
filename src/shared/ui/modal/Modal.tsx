import { useEffect, type ReactNode } from "react"
import styles from "./modal.module.css"

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: "md" | "lg" | "full"
  className?: string
  backdropClassName?: string
  bodyClassName?: string
  showClose?: boolean
  hideHeader?: boolean
  closeOnBackdrop?: boolean
}

const Modal = ({
  open,
  onClose,
  title,
  children,
  size = "lg",
  className,
  backdropClassName,
  bodyClassName,
  showClose = true,
  hideHeader = false,
  closeOnBackdrop = true,
}: ModalProps) => {
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={`${styles.backdrop} ${backdropClassName ?? ""}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`${styles.modal} ${styles[size]} ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {!hideHeader ? (
          <div className={styles.header}>
            {title ? <h3 className={styles.title}>{title}</h3> : <span />}
            {showClose ? (
              <button
                type="button"
                className={styles.close}
                onClick={onClose}
                aria-label="Fechar"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={`${styles.body} ${bodyClassName ?? ""}`}>{children}</div>
      </div>
    </div>
  )
}

export default Modal
