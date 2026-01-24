import styles from "./main.module.css"
import YouTubeThumbnail from "../../shared/ui/video/YouTubeThumbnail"

const TrainingsPage = () => {
  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Treinamentos</h1>
          <p className={styles.navSubtitle}>Acompanhe seus treinamentos em andamento</p>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <h2>Seus cursos</h2>
          <p>Seus cursos atuais e futuros estarão listados abaixo.</p>

          <div className={styles.training_content}>
            <h4>TOTVS RM - Carga Horária: 40hrs</h4>
            <div className={styles.grid_video_area}>
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=9ltxLuNyiBo&list=PL22BuVvWohAowEHys9AX3Tso5V_J33Vw6" className="thumb" />
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=9ltxLuNyiBo&list=PL22BuVvWohAowEHys9AX3Tso5V_J33Vw6" className="thumb" />
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=9ltxLuNyiBo&list=PL22BuVvWohAowEHys9AX3Tso5V_J33Vw6" className="thumb" />
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=9ltxLuNyiBo&list=PL22BuVvWohAowEHys9AX3Tso5V_J33Vw6" className="thumb" />
            </div>
          </div>

          <div className={styles.training_content}>
            <h4>TOTVS Fluig - Carga Horária: 48hrs</h4>
            <div className={styles.grid_video_area}>
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=H4frzPqvW8M" className="thumb" />
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=H4frzPqvW8M" className="thumb" />
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=H4frzPqvW8M" className="thumb" />
              <YouTubeThumbnail video="https://www.youtube.com/watch?v=H4frzPqvW8M" className="thumb" />
            </div>
          </div>

        </div>

      </section>
    </>
  )
}

export default TrainingsPage
