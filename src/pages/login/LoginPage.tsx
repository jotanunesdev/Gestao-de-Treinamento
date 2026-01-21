import styles from "./login.module.css"
import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { useReadView } from "../../shared/hooks/useReadView"
import { useReadViewContext } from "../../app/readViewContext"
import { ROUTES } from "../../app/routes"
import Button from "../../shared/ui/button/Button"
import Input from "../../shared/ui/input/Input"

interface User {
  cpf: string,
  dtNascimento: string
}

const LoginPage = () => {
  const {loading, error, readView} = useReadView()
  const { setData } = useReadViewContext()
  const navigate = useNavigate()
  const [user, setUser] = useState<User>({
    cpf: "",
    dtNascimento: ""
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target

    setUser(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async() => {
    try {
      const cpf = user.cpf.replace(/\D/g, "")
      const nascimento = user.dtNascimento
        ? `${user.dtNascimento} 00:00:00.000`
        : ""
      const filter = `PPESSOA.DTNASCIMENTO='${nascimento}' AND PPESSOA.CPF='${cpf}'`

      const result = await readView({
        dataServerName: "FopFuncData",
        filter,
        context: "CODCOLIGADA=1"
      })
      setData(result)
      navigate(ROUTES.main)
    } catch(e) {
      console.error(e)
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles.login_container}>
        <div className={styles.login_header}>
          <img src="/logo.webp" alt="jota-logo" className={styles.logo} />
          <h1>Bem vindo(a)!</h1>
          <p>Plataforma oficial de treinamentos da JotaNunes. Acesse com sua conta com <strong>CPF</strong> e <strong>Data de Nascimento</strong></p>
        </div>

        <div className="login-form">
          <Button 
            size="lg" 
            variant="ghost" 
            onClick={() => alert("Será direcionado para abertura de chamado")}
            text="Problemas com acesso ? Clique Aqui!" 
            fullWidth
          />

          <div className={styles.divider}>
            <span>ou</span>
          </div>

          <div className={styles.input_group}>
            <Input 
              label="CPF" 
              name="cpf"
              value={user.cpf}
              onChange={handleChange}
              placeholder="000.000.000-00"
            />
            <Input 
              label="Data de Nacimento" 
              type="date" 
              name="dtNascimento"
              value={user.dtNascimento}
              onChange={handleChange}
              placeholder=""
            />

          </div>

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
        {error ? <p>{error}</p> : null}
      </div>
    </div>
  )
}

export default LoginPage
