import styles from "./main.module.css"

// Components
import Aside from "../../shared/ui/aside/Aside"
import GaugeChart from "../../shared/ui/Gauge/GaugeChart"
import YouTubeThumbnail from "../../shared/ui/video/YouTubeThumbnail"

// Icons
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFile } from "@fortawesome/free-solid-svg-icons"

// Hooks
import { useReadViewContext } from "../../app/readViewContext"
import { NavLink } from "react-router-dom"
import { useEffect } from "react"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"



const MainPage = () => {
  const { data } = useReadViewContext<ReadViewResponse>()

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc

  const supportMaterials = [
    { id: "apostila", label: "Apostila da Aula" },
    { id: "politica", label: "Política de Segurança do Trabalho" },
    { id: "prova", label: "Responder Prova" },
  ]

  useEffect(() => {
    console.log(data)
  }, [data])
  

  // const { pathname } = useLocation()
  // const outlet = useOutlet()

  

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

        <nav className={styles.asideNav}>

          <NavLink to="/main/comercial" className={({ isActive }) => isActive ? `${styles.asideLink} ${styles.asideLinkActive}` : styles.asideLink }>
            Dashboard
          </NavLink>

          <NavLink to="/main/analista" className={({ isActive }) => isActive ? `${styles.asideLink} ${styles.asideLinkActive}` : styles.asideLink }>
            Treinamentos
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

        <GaugeChart width={100} heigth={100} value={60} totalValue={101}/>
        

      </header>

      <section className={styles.content}>
        {/* {outlet ?? (

          <div className={styles.contentCard}>

            <h2>Conteudo principal</h2>

            <p>Coloque aqui os seus widgets e informacoes.</p>

          </div>

        )} */}

        <div className={styles.contentCard}>

          <h2>Continue de onde você parou</h2>

          <p>Continue os seus treinamentos clicando no video abaixo.</p>

          <div className={styles.video_section}>
            <div className={styles.video_content}>
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=7pOr3dBFAeY&list=RDr00ikilDxW4&index=6" className="thumb" />
            </div>
            <div className={styles.material}>
              <h2>Material de Apoio</h2>
              <div className={styles.apoio}>
                {supportMaterials.map((item) => (
                  <button key={item.id} type="button" className={styles.apoioItem}>
                    <FontAwesomeIcon icon={faFile} className={styles.apoioIcon} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>


      </section>

    </div>

  )

}



export default MainPage
