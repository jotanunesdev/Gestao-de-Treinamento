import styles from "./aside.module.css"
import type { ReactNode } from "react"

type AsideProps = {
  title?: string
  logoSrc?: string
  logoAlt?: string
  children?: ReactNode
  className?: string
  userName?: string,
  userFunction?: string,
  userSection?: string,
  userCompany?: string
}

const Aside = ({
  title,
  logoSrc,
  logoAlt = "logo",
  children,
  className,
  userName,
  userFunction,
  userSection,
  userCompany
}: AsideProps) => {
  const rootClassName = className ? `${styles.aside} ${className}` : styles.aside

  return (
    <aside className={rootClassName}>
      <div className={styles.aside_container}>
        {(title || logoSrc) && (
          <div className={styles.aside_header}>
            {logoSrc ? (
              <img src={logoSrc} alt={logoAlt} className={styles.logo} />
            ) : null}
            {title ? <h2>{title}</h2> : null}
            {userName ? <h5>{userName}</h5> : null}
            {userFunction && userSection ? <p>{userFunction} - {userSection}</p> : null}
            {userCompany ? <p>{userCompany}</p> : null}
          </div>
        )}

        {children ? <div className={styles.aside_content}>{children}</div> : null}
      </div>
    </aside>
  )
}

export default Aside
