import styles from "./login.module.css"
import { useNavigate, useLocation } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import { useReadViewContext } from "../../app/readViewContext"
import { ROUTES } from "../../app/paths"
import Button from "../../shared/ui/button/Button"
import Input from "../../shared/ui/input/Input"
import Modal from "../../shared/ui/modal/Modal"
import type { User } from "../../entities/types"
import { maskCpf } from "../../shared/utils/maskCpf"
import { ApiError } from "../../shared/api/client"
import {
  firstAccessUser,
  loginUser,
  mapUserToReadView,
} from "../../shared/api/auth"
import { getStoredTheme } from "../../shared/theme"
import {
  consumeCollectiveProofTokenFromUrl,
  readCollectiveProofTokenFromStorage,
} from "../../shared/utils/collectiveProofToken"

const LoginPage = () => {
  const { setData } = useReadViewContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<User>({
    cpf: "",
    dtNascimento: "",
    password: "",
  })
  const [isFirstAccess, setIsFirstAccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [pendingPasswordCpf, setPendingPasswordCpf] = useState("")
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const logoSrc = useMemo(
    () => (getStoredTheme() === "dark" ? "/logo-branca.png" : "/logo.webp"),
    [],
  )

  useEffect(() => {
    const consumed = consumeCollectiveProofTokenFromUrl(location.search)
    if (!consumed) return

    const nextSearch = consumed.cleanedSearch ? `?${consumed.cleanedSearch}` : ""
    navigate(`${location.pathname}${nextSearch}${location.hash}`, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const nextValue = name === "cpf" ? maskCpf(value) : value

    setFormError(null)
    setApiError(null)

    setUser((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const handleToggleFirstAccess = () => {
    setIsFirstAccess((prev) => !prev)
    setFormError(null)
    setPendingPasswordCpf("")
    setApiError(null)
    setUser((prev) => ({
      ...prev,
      dtNascimento: "",
      password: "",
    }))
  }

  const handlePasswordFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordError(null)
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async () => {
    setFormError(null)
    setApiError(null)

    try {
      const cpf = user.cpf.replace(/\D/g, "")
      if (cpf.length !== 11) {
        setFormError("Informe um CPF valido.")
        return
      }

      if (isFirstAccess && !user.dtNascimento) {
        setFormError("Informe sua data de nascimento para o primeiro acesso.")
        return
      }

      if (!isFirstAccess && !user.password) {
        setFormError("Informe sua senha.")
        return
      }

      if (isFirstAccess) {
        setPendingPasswordCpf(cpf)
        setIsPasswordModalOpen(true)
        return
      }

      setIsLoading(true)
      const result = await loginUser({ cpf, password: user.password })
      setData(mapUserToReadView(result.user))
      const hasCollectiveProofToken = Boolean(readCollectiveProofTokenFromStorage())
      navigate(hasCollectiveProofToken ? ROUTES.mainTrainings : ROUTES.main)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && (e.data as { error?: string })?.error) {
          setFormError(
            (e.data as { message?: string })?.message ??
              "Primeiro acesso detectado. Use CPF e data de nascimento.",
          )
          setIsFirstAccess(true)
          setUser((prev) => ({
            ...prev,
            dtNascimento: "",
            password: "",
          }))
          return
        }

        setApiError(e.message)
        return
      }

      console.error(e)
      setApiError("Nao foi possivel realizar o login.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (isPasswordModalOpen) {
        void handleSavePassword()
        return
      }

      void handleSubmit()
    }
  }

  const handleSavePassword = async () => {
    setPasswordError(null)
    setApiError(null)

    if (!pendingPasswordCpf) {
      setPasswordError("Nao foi possivel identificar o CPF.")
      return
    }

    if (!passwordForm.password || !passwordForm.confirmPassword) {
      setPasswordError("Informe e confirme a nova senha.")
      return
    }

    if (passwordForm.password.length < 6) {
      setPasswordError("A senha deve ter ao menos 6 caracteres.")
      return
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError("As senhas nao conferem.")
      return
    }

    if (!user.dtNascimento) {
      setPasswordError("Informe a data de nascimento antes de continuar.")
      return
    }

    try {
      setIsLoading(true)
      const result = await firstAccessUser({
        cpf: pendingPasswordCpf,
        dtNascimento: user.dtNascimento,
        password: passwordForm.password,
      })

      setData(mapUserToReadView(result.user))
      setIsPasswordModalOpen(false)
      setPasswordForm({ password: "", confirmPassword: "" })
      setUser((prev) => ({ ...prev, password: "" }))
      const hasCollectiveProofToken = Boolean(readCollectiveProofTokenFromStorage())
      navigate(hasCollectiveProofToken ? ROUTES.mainTrainings : ROUTES.main)
    } catch (e) {
      if (e instanceof ApiError) {
        setPasswordError(e.message)
        return
      }

      console.error(e)
      setPasswordError("Nao foi possivel concluir o primeiro acesso.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles.login_container}>
        <div className={styles.login_header}>
          <img src={logoSrc} alt="jota-logo" className={styles.logo} />
          <h1>Bem vindo(a)!</h1>
          <p>
            Plataforma oficial de treinamentos da JotaNunes. Acesse com{" "}
            <strong>CPF</strong> e{" "}
            <strong>{isFirstAccess ? "Data de Nascimento" : "Senha"}</strong>.
          </p>
        </div>

        <div className="login-form">
          <Button
            size="lg"
            variant="ghost"
            onClick={handleToggleFirstAccess}
            text={
              isFirstAccess
                ? "Voltar para login com senha"
                : "Primeiro acesso? Clique aqui."
            }
            fullWidth
          />

          <p className={styles.modeHint}>
            {isFirstAccess
              ? "No primeiro acesso, valide seus dados e cadastre uma nova senha."
              : "Entre com seu CPF e senha cadastrada."}
          </p>

          <div className={styles.input_group}>
            <Input
              label="CPF"
              name="cpf"
              value={user.cpf}
              onChange={handleChange}
              placeholder="000.000.000-00"
            />
            {isFirstAccess ? (
              <Input
                label="Data de Nascimento"
                type="date"
                name="dtNascimento"
                value={user.dtNascimento}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder=""
              />
            ) : (
              <Input
                label="Senha"
                type="password"
                name="password"
                value={user.password}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua senha"
              />
            )}
          </div>

          {formError ? <p className={styles.errorText}>{formError}</p> : null}
          {apiError ? <p className={styles.errorText}>{apiError}</p> : null}

          <div className={styles.button_group}>
            <Button
              size="lg"
              text="Acessar"
              onClick={handleSubmit}
              isLoading={isLoading}
              fullWidth
            />
          </div>
        </div>

        <Modal
          open={isPasswordModalOpen}
          onClose={() => {}}
          showClose={false}
          title="Cadastre sua senha"
          size="md"
        >
          <div className={styles.passwordModal}>
            <p className={styles.passwordModalHint}>
              Este e o seu primeiro acesso. Defina uma senha e confirme para
              continuar.
            </p>
            <div className={styles.input_group}>
              <Input
                label="Nova senha"
                type="password"
                name="password"
                value={passwordForm.password}
                onChange={handlePasswordFormChange}
                onKeyDown={handleKeyDown}
                placeholder="Minimo de 6 caracteres"
              />
              <Input
                label="Confirmar senha"
                type="password"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordFormChange}
                onKeyDown={handleKeyDown}
                placeholder="Repita a senha"
              />
            </div>
            {passwordError ? (
              <p className={styles.errorText}>{passwordError}</p>
            ) : null}
            <div className={styles.button_group}>
              <Button
                size="lg"
                text="Salvar senha"
                onClick={handleSavePassword}
                isLoading={isLoading}
                fullWidth
              />
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}

export default LoginPage
