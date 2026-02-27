import styles from "./main.module.css"

// Components
import Aside from "../../shared/ui/aside/Aside"
import Button from "../../shared/ui/button/Button"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faBars,
  faChartLine,
  faClipboardList,
  faCircleCheck,
  faChalkboardUser,
  faGear,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { useEffect, useState } from "react"

// Hooks
import { useReadViewContext } from "../../app/readViewContext"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import { ROUTES } from "../../app/paths"
import { getUserByCpf } from "../../shared/api/users"
import {
  getStoredTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from "../../shared/theme"
import { getFluigLoggedUserName, toPersonNameCase } from "../../shared/fluig/user"

const MAIN_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", to: ROUTES.mainDashboard, icon: faChartLine },
  { id: "trainings", label: "Treinamentos", to: ROUTES.mainTrainings, icon: faClipboardList },
  { id: "completed", label: "Cursos Finalizados", to: ROUTES.mainCompleted, icon: faCircleCheck },
  { id: "instructor", label: "Instrutor", to: ROUTES.instructor, icon: faChalkboardUser },
  { id: "settings", label: "Configuracao", to: ROUTES.settings, icon: faGear },
] as const

const MainPage = () => {
  const { data, setData, clearData } = useReadViewContext<ReadViewResponse>()
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc
  const fluigUserName = getFluigLoggedUserName()
  const asideUserName = fluigUserName ?? toPersonNameCase(pfunc?.NOME ?? "")
  const isInstrutor = Boolean(data?.User?.INSTRUTOR)
  const cpfDigits = (data?.User?.CPF ?? pfunc?.CPF ?? "").replace(/\D/g, "")

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<Theme>
      const nextTheme = customEvent.detail ?? getStoredTheme()
      setTheme(nextTheme)
    }

    document.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

    return () => {
      document.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    }
  }, [])

  useEffect(() => {
    if (!cpfDigits || cpfDigits.length !== 11) {
      return
    }

    let cancelled = false
    getUserByCpf(cpfDigits)
      .then((response) => {
        if (cancelled) return

        const nextInstrutor = Boolean(response.user?.INSTRUTOR)
        if (nextInstrutor === Boolean(data?.User?.INSTRUTOR)) {
          return
        }

        const nextData: ReadViewResponse = {
          ...(data ?? {}),
          User: {
            CPF: cpfDigits,
            INSTRUTOR: nextInstrutor,
            PERMISSAO: response.user?.PERMISSAO ?? data?.User?.PERMISSAO ?? null,
          },
          PFunc: data?.PFunc,
        }

        setData(nextData)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [cpfDigits, data, setData])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleFullscreenChange = async () => {
      const orientationApi = screen.orientation as
        | (ScreenOrientation & { lock?: (orientation: "portrait" | "landscape" | "any") => Promise<void> })
        | undefined
      if (!orientationApi) return

      const isMobileViewport = window.matchMedia("(max-width: 1024px)").matches
      if (!isMobileViewport) return

      if (document.fullscreenElement) {
        if (typeof orientationApi.lock === "function") {
          try {
            await orientationApi.lock("landscape")
          } catch {
            // mobile browser can reject lock depending on gesture/policy
          }
        }
        return
      }

      if (typeof orientationApi.unlock === "function") {
        try {
          orientationApi.unlock()
        } catch {
          // ignore unlock failures
        }
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  const handleLogout = () => {
    clearData()
    navigate(ROUTES.login, { replace: true })
  }

  const logoSrc = theme === "dark" ? "/logo-branca.png" : "/logo.webp"

  return (
    <div className={styles.main}>
      <button
        type="button"
        className={styles.mobileMenuButton}
        aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen((prev) => !prev)}
      >
        <FontAwesomeIcon icon={isMobileMenuOpen ? faXmark : faBars} />
      </button>
      {isMobileMenuOpen ? (
        <button
          type="button"
          className={styles.mobileMenuBackdrop}
          aria-label="Fechar menu"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}
      <Aside
        className={`${styles.asideSlot} ${isMobileMenuOpen ? styles.asideMobileOpen : styles.asideMobileClosed}`}
        logoSrc={logoSrc}
        title="Bem Vindo(a)!"
        userCompany={pfunc?.NOMEFILIAL}
        userFunction={pfunc?.NOME_FUNCAO}
        userSection={pfunc?.NOME_SECAO}
        userName={asideUserName}
      >
        <div className={styles.asideContent}>
          <nav className={styles.asideNav}>
            {MAIN_NAV_ITEMS.filter((item) => isInstrutor || item.id !== "instructor").map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.asideLink} ${styles.asideLinkActive}`
                    : styles.asideLink
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <FontAwesomeIcon icon={item.icon} className={styles.asideLinkIcon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.asideFooter}>
            <Button text="Sair" variant="ghost" fullWidth onClick={handleLogout} />
          </div>
        </div>
      </Aside>

      <Outlet />
    </div>
  )
}

export default MainPage
