import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./main.module.css"
import Button from "../../shared/ui/button/Button"
import { useReadView } from "../../shared/hooks/useReadView"
import type { ReadViewResponse } from "../../shared/types/readView"
import Table, { type TableColumn } from "../../shared/ui/table/Table"
import YouTubeThumbnail from "../../shared/ui/video/YouTubeThumbnail"
import Modal from "../../shared/ui/modal/Modal"

type EmployeeRow = {
    id: string
    NOME?: string
    NOME_FUNCAO?: string
    NOMEDEPARTAMENTO?: string
    CPF?: string
    CPF_SEARCH: string
}

type TrainingRow = {
    id: string
    link: string
    titulo: string
    tempo_video: string
}

type YouTubePlayer = {
    destroy: () => void
}

type YouTubeApi = {
    Player: new (
        element: HTMLElement,
        options: {
            videoId: string
            width?: string | number
            height?: string | number
            playerVars?: Record<string, string | number>
            events?: {
                onStateChange?: (event: { data: number }) => void
            }
        },
    ) => YouTubePlayer
    PlayerState: {
        ENDED: number
    }
}

type YouTubeWindow = Window & {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
}

let youTubeApiPromise: Promise<YouTubeApi> | null = null

const getYouTubeId = (urlOrId: string) => {
    if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId

    try {
        const u = new URL(urlOrId)
        if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "")
        if (u.hostname.includes("youtube.com")) {
            if (u.pathname.startsWith("/watch")) return u.searchParams.get("v")
            if (u.pathname.startsWith("/embed/")) return u.pathname.split("/").pop() ?? null
            if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/").pop() ?? null
            if (u.pathname.startsWith("/live/")) return u.pathname.split("/").pop() ?? null
            return u.searchParams.get("v")
        }
        return null
    } catch {
        return null
    }
}

const loadYouTubeApi = () => {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("YouTube API unavailable"))
    }

    const currentWindow = window as YouTubeWindow
    if (currentWindow.YT?.Player) {
        return Promise.resolve(currentWindow.YT)
    }

    if (!youTubeApiPromise) {
        youTubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
            const existingScript = document.getElementById("youtube-iframe-api")
            if (!existingScript) {
                const script = document.createElement("script")
                script.id = "youtube-iframe-api"
                script.src = "https://www.youtube.com/iframe_api"
                script.async = true
                script.onerror = () => {
                    youTubeApiPromise = null
                    reject(new Error("YouTube API failed to load"))
                }
                document.head.appendChild(script)
            }

            const previousReady = currentWindow.onYouTubeIframeAPIReady
            currentWindow.onYouTubeIframeAPIReady = () => {
                if (typeof previousReady === "function") {
                    previousReady()
                }

                if (currentWindow.YT?.Player) {
                    resolve(currentWindow.YT)
                } else {
                    reject(new Error("YouTube API unavailable"))
                }
            }
        })
    }

    return youTubeApiPromise
}

type QueuePlayerProps = {
    video: string
    title?: string
    onEnded?: () => void
}

const QueuePlayer = ({ video, title, onEnded }: QueuePlayerProps) => {
    const id = useMemo(() => getYouTubeId(video), [video])
    const playerRef = useRef<YouTubePlayer | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!id || !containerRef.current) {
            return undefined
        }

        let cancelled = false

        loadYouTubeApi()
            .then((YT) => {
                if (cancelled || !containerRef.current) {
                    return
                }

                if (playerRef.current) {
                    playerRef.current.destroy()
                }

                playerRef.current = new YT.Player(containerRef.current, {
                    videoId: id,
                    width: "100%",
                    height: "100%",
                    playerVars: {
                        autoplay: 1,
                        rel: 0,
                    },
                    events: {
                        onStateChange: (event) => {
                            if (event.data === YT.PlayerState.ENDED) {
                                onEnded?.()
                            }
                        },
                    },
                })
            })
            .catch(() => undefined)

        return () => {
            cancelled = true
            if (playerRef.current) {
                playerRef.current.destroy()
                playerRef.current = null
            }
        }
    }, [id, onEnded])

    if (!id) {
        return (
            <div className={styles.trainingPlayerPlaceholder}>
                Video indisponivel
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className={styles.trainingPlayerFrame}
            aria-label={title ?? "Video"}
        />
    )
}

const Instructor = () => {
    const { readView } = useReadView<ReadViewResponse>()
    const [employees, setEmployees] = useState<EmployeeRow[]>([])
    const [trainings, setTrainings] = useState<TrainingRow[]>([])
    const [showTable, setShowTable] = useState(false)
    const [showTrainingsTable, setShowTrainingsTable] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
    const [orderedCourseIds, setOrderedCourseIds] = useState<string[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isTrainingStarted, setIsTrainingStarted] = useState(false)
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)

    const columns = useMemo<TableColumn<EmployeeRow>[]>(
        () => [
            { key: "NOME", header: "Nome" },
            { key: "NOME_FUNCAO", header: "Funcao" },
            {
                key: "NOMEDEPARTAMENTO",
                header: "Departamento",
                render: (row) => row.NOMEDEPARTAMENTO ?? "-"
            },
        ],
        [],
    )

    const trainingColumns = useMemo<TableColumn<TrainingRow>[]>(
        () => [
            {
                key: "thumbnail",
                header: "Video",
                render: (row) =>
                    row.link ? (
                        <div className={styles.trainingThumbWrapper}>
                            <YouTubeThumbnail
                                video={row.link}
                                className={styles.trainingThumb}
                                alt={row.titulo}
                            />
                        </div>
                    ) : (
                        <div className={styles.trainingThumbPlaceholder}>Sem video</div>
                    ),
                width: "160px",
            },
            { key: "titulo", header: "Titulo" },
        ],
        [],
    )

    const trainingsMap = useMemo(() => {
        return new Map(trainings.map((training) => [training.id, training]))
    }, [trainings])

    const orderedCourses = useMemo(() => {
        return orderedCourseIds
            .map((id) => trainingsMap.get(id))
            .filter((item): item is TrainingRow => Boolean(item))
    }, [orderedCourseIds, trainingsMap])

    useEffect(() => {
        setOrderedCourseIds((prev) => {
            const kept = prev.filter((id) => selectedCourseIds.includes(id))
            const additions = selectedCourseIds.filter((id) => !kept.includes(id))
            return [...kept, ...additions]
        })
    }, [selectedCourseIds])

    useEffect(() => {
        if (currentVideoId && !orderedCourseIds.includes(currentVideoId)) {
            setCurrentVideoId(null)
            setIsTrainingStarted(false)
        }
    }, [currentVideoId, orderedCourseIds])

    const canOpenTraining =
        selectedParticipantIds.length > 0 && selectedCourseIds.length > 0

    const currentVideo = currentVideoId ? trainingsMap.get(currentVideoId) ?? null : null

    const handleStartTraining = useCallback(() => {
        const firstPlayable = orderedCourses.find((course) => course.link)
        const firstCourse = firstPlayable ?? orderedCourses[0]
        if (!firstCourse) return
        setCurrentVideoId(firstCourse.id)
        setIsTrainingStarted(true)
    }, [orderedCourses])

    const handleVideoEnded = useCallback(() => {
        if (!currentVideoId) return
        const currentIndex = orderedCourseIds.indexOf(currentVideoId)
        if (currentIndex < 0) {
            setIsTrainingStarted(false)
            return
        }
        const nextCourse = orderedCourseIds
            .slice(currentIndex + 1)
            .map((id) => trainingsMap.get(id))
            .find((course): course is TrainingRow => Boolean(course && course.link))
        if (nextCourse) {
            setCurrentVideoId(nextCourse.id)
        } else {
            setIsTrainingStarted(false)
        }
    }, [currentVideoId, orderedCourseIds, trainingsMap])

    const moveCourse = useCallback((id: string, direction: -1 | 1) => {
        setOrderedCourseIds((prev) => {
            const index = prev.indexOf(id)
            const nextIndex = index + direction
            if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) {
                return prev
            }
            const next = [...prev]
            const temp = next[index]
            next[index] = next[nextIndex]
            next[nextIndex] = temp
            return next
        })
    }, [])

    const handleOpenModal = () => {
        if (!canOpenTraining) return
        setIsTrainingStarted(false)
        setCurrentVideoId(null)
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setIsTrainingStarted(false)
        setCurrentVideoId(null)
    }

    const handleClick = async () => {
        try {
            setIsLoading(true)
            setShowTable(false)
            setShowTrainingsTable(false)
            setSelectedParticipantIds([])
            setSelectedCourseIds([])
            setOrderedCourseIds([])
            setIsModalOpen(false)
            setIsTrainingStarted(false)
            setCurrentVideoId(null)
            console.log("Buscando funcionarios RM...")
            const result = await readView({
                dataServerName: "FopFuncData",
                filter: "PFUNC.CODCOLIGADA=1 AND PFUNC.CODSITUACAO='A'",
                context: "CODCOLIGADA=1"
            })
            const rawEmployees = Array.isArray(result.PFunc)
                ? result.PFunc
                : result.PFunc
                    ? [result.PFunc]
                    : []

            const mapped = rawEmployees.map((item, index) => {
                const cpfRaw = typeof item?.CPF === "string" ? item.CPF : ""
                const cpfSearch = cpfRaw.replace(/\D/g, "")
                const department =
                    typeof item?.NOMEDEPARTAMENTO === "string"
                        ? item.NOMEDEPARTAMENTO
                        : typeof item?.NOME_SECAO === "string"
                            ? item.NOME_SECAO
                            : "-"
                const idValue =
                    typeof item?.CHAPA === "string"
                        ? item.CHAPA
                        : typeof item?.CODPESSOA === "string"
                            ? item.CODPESSOA
                            : typeof item?.CODCOLIGADA === "string"
                                ? item.CODCOLIGADA
                                : `${index}`

                return {
                    id: idValue,
                    NOME: item?.NOME,
                    NOME_FUNCAO: item?.NOME_FUNCAO,
                    NOMEDEPARTAMENTO: department,
                    CPF: cpfRaw,
                    CPF_SEARCH: cpfSearch,
                }
            })

            setEmployees(mapped)
            setShowTable(true)
            console.log("Funcionarios RM:", mapped)

            const trainingsResponse = await fetch("/treinamentos.json")
            if (!trainingsResponse.ok) {
                throw new Error("Erro ao carregar treinamentos.json")
            }
            const trainingsJson = await trainingsResponse.json()
            const trainingsList: TrainingRow[] = Array.isArray(trainingsJson)
                ? trainingsJson.map((item, index) => ({
                    id: `${index}`,
                    link: typeof item?.link === "string" ? item.link : "",
                    titulo: typeof item?.titulo === "string" ? item.titulo : "",
                    tempo_video: typeof item?.tempo_video === "string" ? item.tempo_video : "",
                }))
                : []
            setTrainings(trainingsList)
            setShowTrainingsTable(true)
        } catch (error) {
            console.error("Erro ao buscar funcionarios:", error)
        } finally {
            setIsLoading(false)
        }
    }

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
                    <div className={styles.header_content}>
                        <div>
                            <h2>Seus cursos</h2>
                            <p>Seus cursos atuais e futuros estarao listados abaixo.</p>
                        </div>
                        <Button text="+ Treinamento Coletivo" onClick={handleClick} isLoading={isLoading}/>
                    </div>

                    <div className={styles.tables_content}>
                        {showTable ? (
                            <div>
                                <h4>Lista de Presenca</h4>
                                <Table
                                    columns={columns}
                                    data={employees}
                                    selectable
                                    searchable
                                    pageSize={10}
                                    searchableKeys={["NOME", "CPF_SEARCH"]}
                                    onSelectionChange={setSelectedParticipantIds}
                                    getRowId={(row) => row.id}
                                    emptyMessage="Nenhum funcionario encontrado."
                                    searchPlaceholder="Buscar por nome ou CPF"
                                />
                            </div>
                        ) : null}

                        {showTrainingsTable ? (
                            <div>
                                <h4>Cursos</h4>
                                <Table
                                    columns={trainingColumns}
                                    data={trainings}
                                    selectable
                                    searchable
                                    pageSize={10}
                                    searchableKeys={["titulo"]}
                                    onSelectionChange={setSelectedCourseIds}
                                    getRowId={(row) => row.id}
                                    emptyMessage="Nenhum treinamento encontrado."
                                    searchPlaceholder="Buscar por titulo"
                                />
                            </div>
                        ) : null}

                        <div className={styles.trainingAction}>
                            <div className={styles.trainingActionInfo}>
                                <span className={styles.trainingActionTitle}>Pronto para iniciar?</span>
                                <span className={styles.trainingActionHint}>
                                    Selecionados: {selectedParticipantIds.length} participantes e {selectedCourseIds.length} cursos.
                                </span>
                            </div>
                            <Button
                                text="Iniciar Treinamento"
                                onClick={handleOpenModal}
                                disabled={!canOpenTraining}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <Modal
                open={isModalOpen}
                onClose={handleCloseModal}
                size="full"
                title="Planejamento do Treinamento"
            >
                <div className={styles.trainingModal}>
                    <div className={styles.trainingModalHeader}>
                        <div>
                            <h4 className={styles.trainingModalTitle}>Ordene os videos</h4>
                            <p className={styles.trainingModalHint}>
                                Ajuste a fila antes de iniciar o treinamento.
                            </p>
                        </div>
                        <Button
                            text={isTrainingStarted ? "Reiniciar Treinamento" : "Iniciar Treinamento"}
                            onClick={handleStartTraining}
                            disabled={orderedCourses.length === 0}
                        />
                    </div>
                    <div className={styles.trainingModalBody}>
                        <div className={styles.trainingPlayerPanel}>
                            <div className={styles.trainingPlayerHeader}>
                                <span className={styles.trainingPlayerTitle}>
                                    {currentVideo?.titulo ?? "Selecione um video"}
                                </span>
                                {currentVideo?.tempo_video ? (
                                    <span className={styles.trainingPlayerMeta}>
                                        {currentVideo.tempo_video}
                                    </span>
                                ) : null}
                            </div>
                            {isTrainingStarted && currentVideo ? (
                                <QueuePlayer
                                    video={currentVideo.link}
                                    title={currentVideo.titulo}
                                    onEnded={handleVideoEnded}
                                />
                            ) : (
                                <div className={styles.trainingPlayerPlaceholder}>
                                    Clique em iniciar para reproduzir os videos.
                                </div>
                            )}
                        </div>
                        <div className={styles.trainingQueuePanel}>
                            <div className={styles.trainingQueueHeader}>
                                <h4>Fila de videos</h4>
                                <span className={styles.trainingQueueCount}>
                                    {orderedCourses.length} selecionados
                                </span>
                            </div>
                            {orderedCourses.length ? (
                                <ul className={styles.trainingQueueList}>
                                    {orderedCourses.map((course, index) => (
                                        <li
                                            key={course.id}
                                            className={`${styles.trainingQueueItem} ${
                                                course.id === currentVideoId
                                                    ? styles.trainingQueueActive
                                                    : ""
                                            }`}
                                        >
                                            <div className={styles.trainingQueueInfo}>
                                                <span className={styles.trainingQueueTitle}>
                                                    {course.titulo || "Sem titulo"}
                                                </span>
                                                <span className={styles.trainingQueueMeta}>
                                                    {course.tempo_video || "Sem tempo informado"}
                                                </span>
                                            </div>
                                            <div className={styles.trainingQueueActions}>
                                                <Button
                                                    text="Subir"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => moveCourse(course.id, -1)}
                                                    disabled={index === 0}
                                                />
                                                <Button
                                                    text="Descer"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => moveCourse(course.id, 1)}
                                                    disabled={index === orderedCourses.length - 1}
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className={styles.trainingQueueEmpty}>
                                    Selecione cursos na tabela para montar a fila.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    )
}

export default Instructor
