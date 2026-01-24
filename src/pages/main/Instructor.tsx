import styles from "./main.module.css"

const Instructor = () => {
    return (
        <>
            <header className={styles.nav}>
                <div>
                    <h1 className={styles.navTitle}>Intrutor</h1>
                    <p className={styles.navSubtitle}>Acompanhe os treinamentos dos colaboradores em andamento</p>
                </div>
            </header>

            <section className={styles.content}>
                <div className={styles.contentCard}>
                    <h2>Seus cursos</h2>
                    <p>Seus cursos atuais e futuros estarão listados abaixo.</p>
                </div>
            </section>
        </>
    )
}

export default Instructor