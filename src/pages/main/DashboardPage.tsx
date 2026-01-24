import styles from "./main.module.css"

// Components
import GaugeChart from "../../shared/ui/Gauge/GaugeChart"
import YouTubeThumbnail from "../../shared/ui/video/YouTubeThumbnail"

// Icons
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFile } from "@fortawesome/free-solid-svg-icons"

const supportMaterials = [
  { id: "apostila", label: "Apostila da Aula" },
  { id: "politica", label: "Politica de Seguranca do Trabalho" },
  { id: "prova", label: "Responder Prova" },
]

const DashboardPage = () => {
  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Painel</h1>
          <p className={styles.navSubtitle}>Resumo dos Cursos</p>
        </div>

        <GaugeChart width={100} heigth={100} value={60} totalValue={101} />
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <h2>Continue de onde voce parou</h2>
          <p>Continue os seus treinamentos clicando no video abaixo.</p>

          <div className={styles.video_section}>
            <div className={styles.video_content}>
              <YouTubeThumbnail
                video="https://www.youtube.com/watch?v=H4frzPqvW8M"
                className="thumb"
              />
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
    </>
  )
}

export default DashboardPage
