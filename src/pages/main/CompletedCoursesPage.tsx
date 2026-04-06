import { useEffect, useMemo, useState } from "react"
import styles from "./main.module.css"
import { useReadViewContext } from "../../app/readViewContext"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import {
  listCompletedTrilhas,
  type UserTrilhaCompletionRecord,
} from "../../shared/api/userTrainings"

const formatDateTime = (value?: string | null) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("pt-BR")
}

type GroupedByModule = Record<
  string,
  {
    moduleName: string
    trilhas: UserTrilhaCompletionRecord[]
  }
>

const CompletedCoursesPage = () => {
  const { data } = useReadViewContext<ReadViewResponse>()
  const [completions, setCompletions] = useState<UserTrilhaCompletionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc

  const cpf = useMemo(() => {
    const raw = pfunc?.CPF ?? data?.User?.CPF ?? ""
    return raw.replace(/\D/g, "")
  }, [data?.User?.CPF, pfunc?.CPF])

  useEffect(() => {
    if (!cpf || cpf.length !== 11) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    listCompletedTrilhas(cpf)
      .then((response) => {
        if (cancelled) return
        setCompletions(response.completions ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Erro ao carregar cursos finalizados")
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cpf])

  const grouped = useMemo<GroupedByModule>(() => {
    return completions.reduce<GroupedByModule>((acc, item) => {
      const moduleEntry = acc[item.MODULO_ID] ?? {
        moduleName: item.MODULO_NOME,
        trilhas: [],
      }
      moduleEntry.trilhas.push(item)
      acc[item.MODULO_ID] = moduleEntry
      return acc
    }, {})
  }, [completions])

  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Cursos Finalizados</h1>
          <p className={styles.navSubtitle}>Historico de cursos concluidos</p>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <h2>Concluidos</h2>
          <p>Abaixo estao os cursos finalizados com data de conclusao.</p>

          {isLoading ? <p>Carregando cursos finalizados...</p> : null}
          {error ? <p className={styles.trainingEmpty}>Erro: {error}</p> : null}
          {!isLoading && !error && completions.length === 0 ? (
            <p className={styles.trainingEmpty}>Nenhum curso finalizado ainda.</p>
          ) : null}

          {!isLoading &&
            !error &&
            Object.entries(grouped).map(([moduleId, moduleGroup]) => (
              <div key={moduleId} className={styles.training_content}>
                <h4>{moduleGroup.moduleName}</h4>
                <div className={styles.trainingCardsGrid}>
                  {moduleGroup.trilhas.map((item) => (
                    <article
                      key={`${item.TRILHA_ID}-${item.DT_CONCLUSAO}`}
                      className={styles.trainingTrilhaCard}
                    >
                      <h4 className={styles.trainingBlockTitle}>{item.TRILHA_TITULO}</h4>
                      <p className={styles.trainingMeta}>
                        <span className={styles.trainingVideoDone}>
                          Concluido em {formatDateTime(item.DT_CONCLUSAO)}
                        </span>
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>
    </>
  )
}

export default CompletedCoursesPage
