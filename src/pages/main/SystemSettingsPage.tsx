import { useEffect, useMemo, useState } from "react"
import styles from "./main.module.css"

import { useReadViewContext } from "../../app/readViewContext"
import type { PFuncItem, ReadViewResponse } from "../../shared/types/readView"
import Input from "../../shared/ui/input/Input"
import Button from "../../shared/ui/button/Button"
import {
  getActiveCpf,
  getPasswordForCpf,
  setPasswordForCpf,
} from "../../shared/auth/passwordStore"
import { maskCpfRestricted } from "../../shared/utils/maskCpf"
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from "../../shared/theme"

function normalizeDate(value?: string) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
    const [day, month, year] = trimmed.slice(0, 10).split("/")
    return new Date(`${year}-${month}-${day}T00:00:00`)
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return new Date(`${trimmed.slice(0, 10)}T00:00:00`)
  }

  const parsed = new Date(trimmed.replace(" ", "T"))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value?: string) {
  const parsed = normalizeDate(value)
  if (!parsed) {
    return "-"
  }

  return parsed.toLocaleDateString("pt-BR")
}

function calculateAge(value?: string) {
  const birthDate = normalizeDate(value)
  if (!birthDate) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()

  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate())

  if (!hasBirthdayPassed) {
    age -= 1
  }

  return age
}

function formatGender(value?: string) {
  if (!value) {
    return "-"
  }

  const normalized = value.trim().toUpperCase()
  if (normalized === "M") {
    return "Masculino"
  }
  if (normalized === "F") {
    return "Feminino"
  }

  return value
}

type UserInfoItem = {
  id: string
  label: string
  value: string
  sensitive?: boolean
}

const SystemSettingsPage = () => {
  const { data } = useReadViewContext<ReadViewResponse>()

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc

  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const activeCpf = getActiveCpf()
  const cpfDigits = (pfunc?.CPF ?? activeCpf).replace(/\D/g, "")
  const maskedCpf = cpfDigits ? maskCpfRestricted(cpfDigits) : "-"

  const age = useMemo(() => {
    if (pfunc?.IDADE) {
      return pfunc.IDADE
    }

    const calculated = calculateAge(pfunc?.DTNASCIMENTO)
    return calculated == null ? "-" : String(calculated)
  }, [pfunc?.DTNASCIMENTO, pfunc?.IDADE])

  const formattedBirthDate = useMemo(
    () => formatDate(pfunc?.DTNASCIMENTO),
    [pfunc?.DTNASCIMENTO],
  )

  const genderLabel = useMemo(() => formatGender(pfunc?.SEXO), [pfunc?.SEXO])

  const userInfoItems: UserInfoItem[] = [
    { id: "nome", label: "NOME", value: pfunc?.NOME ?? "-" },
    { id: "idade", label: "IDADE", value: age },
    { id: "sexo", label: "SEXO", value: genderLabel },
    { id: "cpf", label: "CPF", value: maskedCpf, sensitive: true },
    {
      id: "filial-1",
      label: "NOMEFILIAL",
      value: pfunc?.NOMEFILIAL ?? "-",
    },
    {
      id: "filial-2",
      label: "NOMEFILIAL",
      value: pfunc?.NOMEFILIAL ?? "-",
    },
    {
      id: "nascimento",
      label: "DTNASCIMENTO",
      value: formattedBirthDate,
    },
  ]

  const handleSetTheme = (nextTheme: Theme) => {
    setTheme(nextTheme)
    setStoredTheme(nextTheme)
    applyTheme(nextTheme)
  }

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

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordError(null)
    setPasswordSuccess(null)
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleChangePassword = () => {
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!cpfDigits) {
      setPasswordError("Nao foi possivel identificar o CPF do usuario logado.")
      return
    }

    const storedPassword = getPasswordForCpf(cpfDigits)
    if (!storedPassword) {
      setPasswordError("Nenhuma senha cadastrada. Use o fluxo de primeiro acesso.")
      return
    }

    if (!passwordForm.currentPassword) {
      setPasswordError("Informe sua senha atual.")
      return
    }

    if (storedPassword !== passwordForm.currentPassword) {
      setPasswordError("Senha atual invalida.")
      return
    }

    if (!passwordForm.newPassword || !passwordForm.confirmNewPassword) {
      setPasswordError("Informe e confirme a nova senha.")
      return
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("A nova senha deve ter ao menos 6 caracteres.")
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError("A confirmacao da nova senha nao confere.")
      return
    }

    setPasswordForCpf(cpfDigits, passwordForm.newPassword)
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    })
    setPasswordSuccess("Senha alterada com sucesso.")
  }

  const handlePreventCopy = (event: React.ClipboardEvent<HTMLElement>) => {
    event.preventDefault()
  }

  const handlePreventContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
  }

  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Configuracao do Sistema</h1>
          <p className={styles.navSubtitle}>
            Ajuste o tema, altere sua senha e visualize seus dados.
          </p>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionHeader}>
              <h2 className={styles.settingsSectionTitle}>Tema</h2>
              <p className={styles.settingsSectionSubtitle}>
                Escolha entre o modo claro ou escuro.
              </p>
            </div>
            <div className={styles.settingsButtonGroup}>
              <button
                type="button"
                className={
                  theme === "light"
                    ? `${styles.themeOption} ${styles.themeOptionActive}`
                    : styles.themeOption
                }
                onClick={() => handleSetTheme("light")}
              >
                Claro
              </button>
              <button
                type="button"
                className={
                  theme === "dark"
                    ? `${styles.themeOption} ${styles.themeOptionActive}`
                    : styles.themeOption
                }
                onClick={() => handleSetTheme("dark")}
              >
                Escuro
              </button>
            </div>
          </section>

          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionHeader}>
              <h2 className={styles.settingsSectionTitle}>Alterar Senha</h2>
              <p className={styles.settingsSectionSubtitle}>
                Confirme sua senha atual para definir uma nova.
              </p>
            </div>
            <div className={styles.settingsForm}>
              <Input
                label="Senha atual"
                type="password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordInputChange}
                placeholder="Digite sua senha atual"
              />
              <Input
                label="Nova senha"
                type="password"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordInputChange}
                placeholder="Minimo de 6 caracteres"
              />
              <Input
                label="Confirmar nova senha"
                type="password"
                name="confirmNewPassword"
                value={passwordForm.confirmNewPassword}
                onChange={handlePasswordInputChange}
                placeholder="Repita a nova senha"
              />
              <p className={styles.settingsInlineHint}>
                Por seguranca, use pelo menos 6 caracteres.
              </p>
              {passwordError ? (
                <p className={styles.settingsFeedbackError}>{passwordError}</p>
              ) : null}
              {passwordSuccess ? (
                <p className={styles.settingsFeedbackSuccess}>{passwordSuccess}</p>
              ) : null}
              <Button size="lg" text="Salvar nova senha" onClick={handleChangePassword} />
            </div>
          </section>

          <section className={styles.settingsSection}>
            <div className={styles.settingsSectionHeader}>
              <h2 className={styles.settingsSectionTitle}>Seus Dados</h2>
              <p className={styles.settingsSectionSubtitle}>
                Informacoes exibidas apenas para consulta.
              </p>
            </div>
            <div className={styles.infoGrid}>
              {userInfoItems.map((item) => (
                <article key={item.id} className={styles.infoItem}>
                  <span className={styles.infoLabel}>{item.label}</span>
                  <span
                    className={
                      item.sensitive
                        ? `${styles.infoValue} ${styles.sensitiveValue}`
                        : styles.infoValue
                    }
                    onCopy={item.sensitive ? handlePreventCopy : undefined}
                    onCut={item.sensitive ? handlePreventCopy : undefined}
                    onContextMenu={
                      item.sensitive ? handlePreventContextMenu : undefined
                    }
                  >
                    {item.value}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  )
}

export default SystemSettingsPage
