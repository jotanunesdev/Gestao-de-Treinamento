import styles from "./main.module.css"

// Components
import Aside from "../../shared/ui/aside/Aside"
import Button from "../../shared/ui/button/Button"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faChartLine, faClipboardList, faCircleCheck, faChalkboardUser } from "@fortawesome/free-solid-svg-icons"
import { useState } from "react"

// Hooks
import { useReadViewContext } from "../../app/readViewContext"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import { ROUTES } from "../../app/paths"
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "../../shared/theme"


const MAIN_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", to: ROUTES.mainDashboard, icon: faChartLine },
  { id: "trainings", label: "Treinamentos", to: ROUTES.mainTrainings, icon: faClipboardList },
  { id: "completed", label: "Cursos Finalizados", to: ROUTES.mainCompleted, icon: faCircleCheck },
  { id: "instructor", label: "Instrutor", to: ROUTES.instructor, icon: faChalkboardUser },
] as const

const MainPage = () => {
  const { data, clearData } = useReadViewContext<ReadViewResponse>()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc

  const handleToggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark"
    setTheme(nextTheme)
    setStoredTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const handleLogout = () => {
    clearData()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <div className={styles.main}>
      <Aside
        className={styles.asideSlot}
        logoSrc="/logo.webp"
        title="Bem Vindo(a)!"
        userCompany={pfunc?.NOMEFILIAL}
        userFunction={pfunc?.NOME_FUNCAO}
        userSection={pfunc?.NOME_SECAO}
        userName={pfunc?.NOME}
      >
        <div className={styles.asideContent}>
          <nav className={styles.asideNav}>
            {MAIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.asideLink} ${styles.asideLinkActive}`
                    : styles.asideLink
                }
              >
                <FontAwesomeIcon icon={item.icon} className={styles.asideLinkIcon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.asideFooter}>
            <div className={styles.themeToggle}>
              <span className={styles.themeLabel}>Modo escuro</span>
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-label="Alternar modo escuro"
                className={styles.themeSwitch}
                data-checked={theme === "dark"}
                onClick={handleToggleTheme}
              >
                <span className={styles.themeThumb} aria-hidden="true" />
              </button>
            </div>
            <Button text="Sair" variant="ghost" fullWidth onClick={handleLogout} />
          </div>
        </div>
      </Aside>

      <Outlet />
    </div>
  )
}

export default MainPage
