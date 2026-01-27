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

type TrainingType = "video" | "pdf"

type TrainingRow = {
    id: string
    link: string
    titulo: string
    tempo_video: string
    tipo: TrainingType
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
    const wrapperRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!id || !wrapperRef.current) {
            return undefined
        }

        let cancelled = false
        const wrapper = wrapperRef.current
        const host = document.createElement("div")
        host.style.width = "100%"
        host.style.height = "100%"
        wrapper.replaceChildren(host)

        loadYouTubeApi()
            .then((YT) => {
                if (cancelled) {
                    return
                }

                if (playerRef.current) {
                    try {
                        playerRef.current.destroy()
                    } catch {
                        // ignore teardown errors from third-party API
                    }
                }

                playerRef.current = new YT.Player(host, {
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
                try {
                    playerRef.current.destroy()
                } catch {
                    // ignore teardown errors from third-party API
                }
                playerRef.current = null
            }
            if (wrapper.isConnected) {
                wrapper.replaceChildren()
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
            ref={wrapperRef}
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
    const [trainingViewType, setTrainingViewType] = useState<TrainingType>("video")
    const [isLoading, setIsLoading] = useState(false)
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
    const [orderedCourseIds, setOrderedCourseIds] = useState<string[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isTrainingStarted, setIsTrainingStarted] = useState(false)
    const [currentTrainingId, setCurrentTrainingId] = useState<string | null>(null)
    const [isPdfFullscreen, setIsPdfFullscreen] = useState(false)
    const pdfContainerRef = useRef<HTMLDivElement | null>(null)

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

    const trainingVideoColumns = useMemo<TableColumn<TrainingRow>[]>(
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

    const trainingPdfColumns = useMemo<TableColumn<TrainingRow>[]>(
        () => [
            {
                key: "pdf",
                header: "PDF",
                render: (row) =>
                    row.link ? (
                        <div className={styles.trainingThumbWrapper}>
                            <div className={styles.trainingPdfThumb}>
                                <span className={styles.trainingPdfThumbLabel}>PDF</span>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.trainingThumbPlaceholder}>Sem PDF</div>
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

    const filteredTrainings = useMemo(() => {
        return trainings.filter((training) => training.tipo === trainingViewType)
    }, [trainings, trainingViewType])

    const trainingColumns =
        trainingViewType === "video" ? trainingVideoColumns : trainingPdfColumns

    const isPlayableTraining = useCallback((course: TrainingRow) => {
        if (!course.link) return false
        if (course.tipo === "pdf") return true
        return Boolean(getYouTubeId(course.link))
    }, [])

    useEffect(() => {
        setOrderedCourseIds((prev) => {
            const kept = prev.filter((id) => selectedCourseIds.includes(id))
            const additions = selectedCourseIds.filter((id) => !kept.includes(id))
            return [...kept, ...additions]
        })
    }, [selectedCourseIds])

    useEffect(() => {
        if (currentTrainingId && !orderedCourseIds.includes(currentTrainingId)) {
            setCurrentTrainingId(null)
            setIsTrainingStarted(false)
        }
    }, [currentTrainingId, orderedCourseIds])

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsPdfFullscreen(document.fullscreenElement === pdfContainerRef.current)
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange)
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange)
        }
    }, [])

    const canOpenTraining =
        selectedParticipantIds.length > 0 && selectedCourseIds.length > 0

    const currentTraining = currentTrainingId ? trainingsMap.get(currentTrainingId) ?? null : null
    // Compatibilidade com estados antigos durante HMR.
    const currentVideo = currentTraining
    const currentVideoId = currentTrainingId

    const advanceToNextTraining = useCallback((fromId: string) => {
        const currentIndex = orderedCourseIds.indexOf(fromId)
        if (currentIndex < 0) {
            setIsTrainingStarted(false)
            setCurrentTrainingId(null)
            return
        }

        const nextCourse = orderedCourseIds
            .slice(currentIndex + 1)
            .map((id) => trainingsMap.get(id))
            .find((course): course is TrainingRow => Boolean(course && isPlayableTraining(course)))

        if (nextCourse) {
            setCurrentTrainingId(nextCourse.id)
        } else {
            setIsTrainingStarted(false)
            setCurrentTrainingId(null)
        }
    }, [orderedCourseIds, trainingsMap, isPlayableTraining])

    const hasNextTraining = useMemo(() => {
        if (!currentTrainingId) return false
        const currentIndex = orderedCourseIds.indexOf(currentTrainingId)
        if (currentIndex < 0) return false
        return orderedCourseIds
            .slice(currentIndex + 1)
            .map((id) => trainingsMap.get(id))
            .some((course) => Boolean(course && isPlayableTraining(course)))
    }, [currentTrainingId, orderedCourseIds, trainingsMap, isPlayableTraining])

    const handleStartTraining = useCallback(() => {
        const firstPlayable = orderedCourses.find(isPlayableTraining)
        const firstCourse = firstPlayable ?? orderedCourses[0]
        if (!firstCourse) return
        setCurrentTrainingId(firstCourse.id)
        setIsTrainingStarted(true)
    }, [orderedCourses, isPlayableTraining])

    const handleVideoEnded = useCallback(() => {
        if (!currentTrainingId) return
        advanceToNextTraining(currentTrainingId)
    }, [advanceToNextTraining, currentTrainingId])

    const handleNextFromPdf = useCallback(() => {
        if (!currentTrainingId) return
        advanceToNextTraining(currentTrainingId)
    }, [advanceToNextTraining, currentTrainingId])

    const handleTogglePdfFullscreen = useCallback(() => {
        const container = pdfContainerRef.current
        if (!container) return

        if (document.fullscreenElement === container) {
            document.exitFullscreen().catch(() => undefined)
            return
        }

        container.requestFullscreen?.().catch(() => undefined)
    }, [])

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
        setCurrentTrainingId(null)
        setIsModalOpen(true)
    }

    const handleCloseModal = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => undefined)
        }
        setIsModalOpen(false)
        setIsTrainingStarted(false)
        setCurrentTrainingId(null)
        setIsPdfFullscreen(false)
    }

    const handleClick = async () => {
        try {
            setIsLoading(true)
            setShowTable(false)
            setShowTrainingsTable(false)
            setTrainingViewType("video")
            setSelectedParticipantIds([])
            setSelectedCourseIds([])
            setOrderedCourseIds([])
            setIsModalOpen(false)
            setIsTrainingStarted(false)
            setCurrentTrainingId(null)
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
                ? trainingsJson.map((item, index) => {
                    const tipo: TrainingType = item?.tipo === "pdf" ? "pdf" : "video"
                    return {
                        id: `${tipo}-${index}`,
                        tipo,
                        link: typeof item?.link === "string" ? item.link : "",
                        titulo: typeof item?.titulo === "string" ? item.titulo : "",
                        tempo_video: typeof item?.tempo_video === "string" ? item.tempo_video : "",
                    }
                })
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
            {/* <header className={styles.nav}>
                <div>
                    <h1 className={styles.navTitle}>Intrutor</h1>
                    <p className={styles.navSubtitle}>Acompanhe os treinamentos dos colaboradores em andamento</p>
                </div>
            </header> */}

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
                                <h4 style={{marginBottom: "10px"}}>Lista de Presença</h4>
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
                            <div className={styles.trainingTableSection}>
                                <div className={styles.trainingTableHeader}>
                                    <h4 style={{marginBottom: "10px"}}>Materiais</h4>
                                    <div className={styles.trainingTypeToggle} role="group" aria-label="Tipo de material">
                                        <Button
                                            text="Videos"
                                            size="sm"
                                            variant={trainingViewType === "video" ? "primary" : "ghost"}
                                            onClick={() => setTrainingViewType("video")}
                                        />
                                        <Button
                                            text="PDFs"
                                            size="sm"
                                            variant={trainingViewType === "pdf" ? "primary" : "ghost"}
                                            onClick={() => setTrainingViewType("pdf")}
                                        />
                                    </div>
                                </div>
                                <Table
                                    columns={trainingColumns}
                                    data={filteredTrainings}
                                    selectable
                                    searchable
                                    pageSize={4}
                                    searchableKeys={["titulo"]}
                                    selectedRowIds={selectedCourseIds}
                                    onSelectionChange={setSelectedCourseIds}
                                    getRowId={(row) => row.id}
                                    emptyMessage={
                                        trainingViewType === "video"
                                            ? "Nenhum video encontrado."
                                            : "Nenhum PDF encontrado."
                                    }
                                    searchPlaceholder={
                                        trainingViewType === "video"
                                            ? "Buscar por titulo do video"
                                            : "Buscar por titulo do PDF"
                                    }
                                />
                            </div>
                        ) : null}

                        <div className={styles.trainingAction}>
                            <div className={styles.trainingActionInfo}>
                                <span className={styles.trainingActionTitle}>Pronto para iniciar?</span>
                                <span className={styles.trainingActionHint}>
                                    Selecionados: {selectedParticipantIds.length} participantes e {selectedCourseIds.length} materiais.
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
                            <h4 className={styles.trainingModalTitle}>Ordene os materiais</h4>
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
                                    {currentTraining?.titulo ?? "Selecione um material"}
                                </span>
                                {currentTraining ? (
                                    <span className={styles.trainingPlayerMeta}>
                                        {currentTraining.tipo === "video"
                                            ? currentTraining.tempo_video || "Video"
                                            : "PDF"}
                                    </span>
                                ) : null}
                            </div>
                            {isTrainingStarted && currentTraining ? (
                                currentTraining.tipo === "video" ? (
                                    <QueuePlayer
                                        video={currentTraining.link}
                                        title={currentTraining.titulo}
                                        onEnded={handleVideoEnded}
                                    />
                                ) : (
                                    <div ref={pdfContainerRef} className={styles.trainingPdfContainer}>
                                        <iframe
                                            className={styles.trainingPdfFrame}
                                            src={currentTraining.link}
                                            title={currentTraining.titulo || "PDF"}
                                        />
                                        <div className={styles.trainingPdfActions}>
                                            <Button
                                                text={isPdfFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                                                variant="ghost"
                                                onClick={handleTogglePdfFullscreen}
                                            />
                                            <Button
                                                text="Proximo"
                                                onClick={handleNextFromPdf}
                                                disabled={!hasNextTraining}
                                            />
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className={styles.trainingPlayerPlaceholder}>
                                    Clique em iniciar para reproduzir os materiais.
                                </div>
                            )}
                        </div>
                        <div className={styles.trainingQueuePanel}>
                            <div className={styles.trainingQueueHeader}>
                                <h4>Fila de materiais</h4>
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
                                                course.id === currentTrainingId
                                                    ? styles.trainingQueueActive
                                                    : ""
                                            }`}
                                        >
                                            <div className={styles.trainingQueueInfo}>
                                                <span
                                                    className={`${styles.trainingQueueTypeBadge} ${
                                                        course.tipo === "pdf"
                                                            ? styles.trainingQueueTypePdf
                                                            : styles.trainingQueueTypeVideo
                                                    }`}
                                                >
                                                    {course.tipo === "pdf" ? "PDF" : "Video"}
                                                </span>
                                                <span className={styles.trainingQueueTitle}>
                                                    {course.titulo || "Sem titulo"}
                                                </span>
                                                <span className={styles.trainingQueueMeta}>
                                                    {course.tipo === "video"
                                                        ? course.tempo_video || "Sem tempo informado"
                                                        : "Material PDF"}
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
                                    Selecione materiais na tabela para montar a fila.
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
