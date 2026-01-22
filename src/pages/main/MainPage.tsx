import { useReadViewContext } from '../../app/readViewContext'
import styles from "./main.module.css"
import Aside from '../../shared/ui/aside/Aside'
import { NavLink } from "react-router-dom"
import { useEffect } from 'react'



const MainPage = () => {
  const { data } = useReadViewContext()

  useEffect(() => {
    console.log(data)
  }, [data])
  

  // const { pathname } = useLocation()
  // const outlet = useOutlet()

  

  return (

    <div className={styles.main}>

      <Aside  className={styles.asideSlot} logoSrc="/logo.webp" title="Bem Vindo(a)!" userCompany={data.PFunc.NOMEFILIAL} userFunction={data.PFunc.NOME_FUNCAO} userSection={data.PFunc.NOME_SECAO} userName={data.PFunc.NOME} subtitle="Acompanhe suas atividades e acesso rapido.">

        <nav className={styles.asideNav}>

          <NavLink to="/main/comercial" className={({ isActive }) => isActive ? `${styles.asideLink} ${styles.asideLinkActive}` : styles.asideLink }>
            Dashboard
          </NavLink>

          <NavLink to="/main/analista" className={({ isActive }) => isActive ? `${styles.asideLink} ${styles.asideLinkActive}` : styles.asideLink }>
            Matriz de Treinamento
          </NavLink>

          <NavLink to="/main/analista" className={({ isActive }) => isActive ? `${styles.asideLink} ${styles.asideLinkActive}` : styles.asideLink }>
            Cursos Finalizados
          </NavLink>

        </nav>

      </Aside>

      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Painel</h1>
          <p className={styles.navSubtitle}>Resumo dos Cursos</p>
        </div>

        {/* <div className={styles.navActions}>
          {navItems.length > 0 ? navItems.map((item) => (
                <Button key={item} text={item} variant="secondary" />
            )) : (
                <Button text="Nova Solicitacao" onClick={() => console.log(pathname)} />
            )}
        </div> */}

      </header>

      <section className={styles.content}>
        {/* {outlet ?? (

          <div className={styles.contentCard}>

            <h2>Conteudo principal</h2>

            <p>Coloque aqui os seus widgets e informacoes.</p>

          </div>

        )} */}

        <div className={styles.contentCard}>

          <h2>Conteudo principal</h2>

          <p>Coloque aqui os seus widgets e informacoes.</p>

        </div>

      </section>

    </div>

  )

}



export default MainPage
