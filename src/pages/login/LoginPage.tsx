import styles from "./login.module.css"
import { useNavigate } from "react-router-dom"
import { useMemo, useState } from "react"
import { useReadView } from "../../shared/hooks/useReadView"
import { useReadViewContext } from "../../app/readViewContext"
import type { ReadViewResponse } from "../../shared/types/readView"
import { ROUTES } from "../../app/paths"
import Button from "../../shared/ui/button/Button"
import Input from "../../shared/ui/input/Input"
import Modal from "../../shared/ui/modal/Modal"
import type { User } from "../../entities/types"
import { maskCpf } from "../../shared/utils/maskCpf"
import {
  getPasswordForCpf,
  setActiveCpf,
  setPasswordForCpf,
} from "../../shared/auth/passwordStore"
import { getStoredTheme } from "../../shared/theme"

const LoginPage = () => {
  const { loading, error, readView } = useReadView<ReadViewResponse>()
  const { setData } = useReadViewContext<ReadViewResponse>()
  const navigate = useNavigate()
  const [user, setUser] = useState<User>({
    cpf: "",
    dtNascimento: "",
    password: "",
  })
  const [isFirstAccess, setIsFirstAccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [pendingPasswordCpf, setPendingPasswordCpf] = useState("")
  const [pendingReadViewData, setPendingReadViewData] =
    useState<ReadViewResponse | null>(null)
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const logoSrc = useMemo(
    () => (getStoredTheme() === "dark" ? "/logo-branca.png" : "/logo.webp"),
    [],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const nextValue = name === "cpf" ? maskCpf(value) : value

    setFormError(null)

    setUser((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const handleToggleFirstAccess = () => {
    setIsFirstAccess((prev) => !prev)
    setFormError(null)
    setPendingReadViewData(null)
    setPendingPasswordCpf("")
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

  const buildFilter = (cpfDigits: string) => {
    if (!isFirstAccess) {
      return `PPESSOA.CPF='${cpfDigits}' AND PFUNC.CODSITUACAO='A'`
    }

    const nascimento = user.dtNascimento
      ? `${user.dtNascimento} 00:00:00.000`
      : ""

    return `PPESSOA.DTNASCIMENTO='${nascimento}' AND PPESSOA.CPF='${cpfDigits}' AND PFUNC.CODSITUACAO='A'`
  }

  const handleSubmit = async () => {
    setFormError(null)

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

      const filter = buildFilter(cpf)

      const result = await readView({
        dataServerName: "FopFuncData",
        filter,
        context: "CODCOLIGADA=1",
      })

      if (isFirstAccess) {
        const existingPassword = getPasswordForCpf(cpf)
        if (existingPassword) {
          setFormError("Sua senha ja esta cadastrada. Entre com CPF e senha.")
          setIsFirstAccess(false)
          setPendingReadViewData(null)
          setPendingPasswordCpf("")
          return
        }

        setPendingPasswordCpf(cpf)
        setPendingReadViewData(result)
        setIsPasswordModalOpen(true)
        return
      }

      const storedPassword = getPasswordForCpf(cpf)
      if (!storedPassword) {
        setFormError("Primeiro acesso detectado. Use CPF e data de nascimento.")
        setIsFirstAccess(true)
        setUser((prev) => ({
          ...prev,
          dtNascimento: "",
          password: "",
        }))
        return
      }

      if (storedPassword !== user.password) {
        setFormError("Senha invalida. Tente novamente.")
        return
      }

      setData(result)
      setActiveCpf(cpf)
      navigate(ROUTES.main)
    } catch (e) {
      console.error(e)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleSubmit()
    }
  }

  const handleSavePassword = () => {
    setPasswordError(null)

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

    if (!pendingReadViewData) {
      setPasswordError("Nao foi possivel concluir o acesso. Tente novamente.")
      return
    }

    setPasswordForCpf(pendingPasswordCpf, passwordForm.password)
    setData(pendingReadViewData)
    setActiveCpf(pendingPasswordCpf)
    setPendingReadViewData(null)
    setIsPasswordModalOpen(false)
    setPasswordForm({ password: "", confirmPassword: "" })
    setUser((prev) => ({ ...prev, password: "" }))
    navigate(ROUTES.main)
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
          {error ? <p className={styles.errorText}>{error}</p> : null}

          <div className={styles.button_group}>
            <Button
              size="lg"
              text="Acessar"
              onClick={handleSubmit}
              isLoading={loading}
              fullWidth
            />
            <Button
              size="lg"
              variant="secondary"
              text="Solicitar Acesso"
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
