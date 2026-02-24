import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as faceapi from "face-api.js"
import Modal from "../modal/Modal"
import Button from "../button/Button"
import { enrollFace, matchFaceDescriptor, type FaceMatchCandidate } from "../../api/faces"
import styles from "./facialEnrollment.module.css"

type Participant = {
  id: string
  cpf: string
  nome: string
  raw: Record<string, string>
}

export type FacialCaptureResult = {
  participantId: string
  cpf: string
  nome: string
  createdAt: string
  match: FaceMatchCandidate | null
  fotoBase64: string | null
  fotoUrl: string | null
}

type PendingCapture = {
  descriptor: number[]
  fotoBase64: string
  match: FaceMatchCandidate | null
}

type FacialEnrollmentModalProps = {
  open: boolean
  onClose: () => void
  participants: Participant[]
  instructorCpf?: string
  onCompleted: (captures: FacialCaptureResult[]) => void
}

const MODEL_URL =
  import.meta.env.VITE_FACE_MODEL_URL ??
  "https://justadudewhohacks.github.io/face-api.js/models"

const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  scoreThreshold: 0.55,
})

let modelsPromise: Promise<void> | null = null

function loadModels() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined)
  }

  return modelsPromise
}

const FacialEnrollmentModal = ({
  open,
  onClose,
  participants,
  instructorCpf,
  onCompleted,
}: FacialEnrollmentModalProps) => {
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState("")
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const [status, setStatus] = useState("Aguardando abertura da coleta facial.")
  const [isCapturing, setIsCapturing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null)
  const [selectedParticipantId, setSelectedParticipantId] = useState("")
  const [capturesMap, setCapturesMap] = useState<Record<string, FacialCaptureResult>>({})
  const [isMatchConfirmOpen, setIsMatchConfirmOpen] = useState(false)
  const [matchParticipantId, setMatchParticipantId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const participantsById = useMemo(() => {
    const map = new Map<string, Participant>()
    for (const participant of participants) {
      map.set(participant.id, participant)
    }
    return map
  }, [participants])

  const pendingParticipants = useMemo(() => {
    return participants.filter((participant) => !capturesMap[participant.id])
  }, [participants, capturesMap])

  const allCaptured = participants.length > 0 && pendingParticipants.length === 0
  const matchedCandidate = pendingCapture?.match ?? null
  const matchedParticipant = useMemo(() => {
    if (!matchParticipantId) return null
    return participantsById.get(matchParticipantId) ?? null
  }, [matchParticipantId, participantsById])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  const loadAvailableCameras = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameras = devices.filter((device) => device.kind === "videoinput")
    setAvailableCameras(cameras)
    return cameras
  }, [])

  const resetState = useCallback(() => {
    setStatus("Aguardando abertura da coleta facial.")
    setPendingCapture(null)
    setSelectedParticipantId("")
    setCapturesMap({})
    setIsMatchConfirmOpen(false)
    setMatchParticipantId(null)
    setIsCapturing(false)
    setIsSaving(false)
    setAvailableCameras([])
    setSelectedCameraId("")
    setIsSwitchingCamera(false)
  }, [])

  const startCamera = useCallback(async (deviceId?: string) => {
    const video = videoRef.current
    if (!video) {
      throw new Error("Elemento de video nao encontrado")
    }

    stopCamera()

    const videoConstraints: MediaTrackConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    })

    streamRef.current = stream
    video.srcObject = stream
    await video.play()
    setCameraReady(true)

    const [track] = stream.getVideoTracks()
    const activeDeviceId = track?.getSettings().deviceId
    const cameras = await loadAvailableCameras()

    if (activeDeviceId) {
      setSelectedCameraId(activeDeviceId)
    } else if (cameras.length > 0) {
      setSelectedCameraId((previous) => previous || cameras[0].deviceId)
    }
  }, [loadAvailableCameras, stopCamera])

  const switchCamera = useCallback(
    async (deviceId: string) => {
      if (!deviceId) return
      if (deviceId === selectedCameraId) return

      try {
        setIsSwitchingCamera(true)
        setStatus("Trocando camera...")
        await startCamera(deviceId)
        setStatus("Camera pronta. Posicione o colaborador e capture.")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nao foi possivel trocar a camera"
        setStatus(message)
      } finally {
        setIsSwitchingCamera(false)
      }
    },
    [selectedCameraId, startCamera],
  )

  useEffect(() => {
    if (!open) {
      stopCamera()
      resetState()
      return
    }

    let cancelled = false
    setStatus("Carregando modelos faciais...")

    const bootstrap = async () => {
      try {
        await loadModels()
        if (cancelled) return
        setModelsLoaded(true)
        setStatus("Modelos carregados. Iniciando camera...")
        await startCamera()
        if (cancelled) return
        setStatus("Camera pronta. Posicione o colaborador e capture.")
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "Falha ao iniciar coleta facial"
        setStatus(message)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, resetState, startCamera, stopCamera])

  useEffect(() => {
    if (!open) return
    if (!navigator.mediaDevices?.addEventListener) return

    const handleDeviceChange = () => {
      void loadAvailableCameras()
    }

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange)
    }
  }, [loadAvailableCameras, open])

  const captureDescriptor = useCallback(async () => {
    if (!modelsLoaded || !cameraReady) {
      setStatus("Camera ainda nao esta pronta.")
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      setStatus("Componentes de captura indisponiveis.")
      return
    }

    setIsCapturing(true)
    try {
      const detection = await faceapi
        .detectSingleFace(video, DETECTOR_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection) {
        setStatus("Nenhum rosto detectado. Reposicione e tente novamente.")
        return
      }

      const descriptor = Array.from(detection.descriptor)
      if (descriptor.length !== 128) {
        setStatus("Nao foi possivel extrair o descriptor facial.")
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext("2d")
      if (!context) {
        setStatus("Falha ao gerar foto para a captura.")
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const fotoBase64 = canvas.toDataURL("image/jpeg", 0.9)

      const matchResponse = await matchFaceDescriptor({ descriptor })
      const matchedCpf = matchResponse.match?.cpf ?? null
      const matchedParticipant = matchedCpf
        ? participants.find((participant) => participant.cpf === matchedCpf)
        : null

      const defaultParticipantId =
        matchedParticipant?.id ?? pendingParticipants[0]?.id ?? participants[0]?.id ?? ""

      setPendingCapture({
        descriptor,
        fotoBase64,
        match: matchResponse.match,
      })
      setSelectedParticipantId(defaultParticipantId)

      if (matchResponse.match) {
        setMatchParticipantId(matchedParticipant?.id ?? null)
        setIsMatchConfirmOpen(true)
        setStatus(
          `Rosto identificado como ${matchResponse.match.nome ?? matchResponse.match.cpf}.`,
        )
      } else {
        setMatchParticipantId(null)
        setIsMatchConfirmOpen(false)
        setStatus("Rosto capturado. Selecione o colaborador e confirme.")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao capturar rosto"
      setStatus(message)
    } finally {
      setIsCapturing(false)
    }
  }, [cameraReady, modelsLoaded, participants, pendingParticipants])

  const persistCaptureForParticipant = useCallback(async (participantId: string) => {
    const participant = participantsById.get(participantId)
    if (!participant) {
      setStatus("Colaborador selecionado invalido.")
      return
    }
    if (!pendingCapture) {
      setStatus("Capture um rosto antes de confirmar.")
      return
    }

    setIsSaving(true)
    try {
      const enrollResponse = await enrollFace({
        cpf: participant.cpf,
        descriptor: pendingCapture.descriptor,
        fotoBase64: pendingCapture.fotoBase64,
        origem: "treinamento-coletivo",
        criadoPor: instructorCpf,
        user: participant.raw,
      })

      const capture: FacialCaptureResult = {
        participantId: participant.id,
        cpf: participant.cpf,
        nome: participant.nome,
        createdAt: new Date().toISOString(),
        match: pendingCapture.match,
        fotoBase64: enrollResponse.face?.FOTO_BASE64 ?? pendingCapture.fotoBase64 ?? null,
        fotoUrl: enrollResponse.face?.FOTO_URL ?? null,
      }

      setCapturesMap((current) => ({
        ...current,
        [participant.id]: capture,
      }))
      setPendingCapture(null)
      setSelectedParticipantId("")
      setIsMatchConfirmOpen(false)
      setMatchParticipantId(null)
      setStatus(`Facial confirmada para ${participant.nome}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar facial"
      setStatus(message)
    } finally {
      setIsSaving(false)
    }
  }, [pendingCapture, participantsById, instructorCpf])

  const confirmCapture = useCallback(() => {
    if (!pendingCapture) {
      setStatus("Capture um rosto antes de confirmar.")
      return
    }
    if (!selectedParticipantId) {
      setStatus("Selecione o colaborador correspondente.")
      return
    }
    void persistCaptureForParticipant(selectedParticipantId)
  }, [pendingCapture, selectedParticipantId, persistCaptureForParticipant])

  const handleConfirmMatched = useCallback(() => {
    if (!matchParticipantId) {
      setIsMatchConfirmOpen(false)
      setStatus("Rosto encontrado fora da lista selecionada. Vincule manualmente.")
      return
    }
    setSelectedParticipantId(matchParticipantId)
    void persistCaptureForParticipant(matchParticipantId)
  }, [matchParticipantId, persistCaptureForParticipant])

  const handleMatchManual = useCallback(() => {
    setIsMatchConfirmOpen(false)
    setStatus("Confirme manualmente o colaborador correspondente.")
  }, [])

  const matchedRole =
    matchedParticipant?.raw?.NOME_FUNCAO ??
    matchedParticipant?.raw?.CARGO ??
    "-"
  const matchedDepartment =
    matchedParticipant?.raw?.NOMEDEPARTAMENTO ??
    matchedParticipant?.raw?.NOME_SECAO ??
    "-"

  const handleComplete = useCallback(() => {
    if (!allCaptured) {
      setStatus("Confirme a facial de todos os colaboradores antes de finalizar.")
      return
    }

    const captures = Object.values(capturesMap).sort((left, right) =>
      left.nome.localeCompare(right.nome, "pt-BR"),
    )
    onCompleted(captures)
  }, [allCaptured, capturesMap, onCompleted])

  return (
    <>
      <Modal open={open} onClose={onClose} size="full" title="Validacao Facial do Treinamento">
        <div className={styles.layout}>
          <div className={styles.cameraPanel}>
            <div className={styles.cameraHeader}>
              <h4>Captura</h4>
              <span>{cameraReady ? "Camera ativa" : "Camera inativa"}</span>
            </div>
            <div className={styles.cameraSwitchRow}>
              <label htmlFor="camera-select" className={styles.cameraSwitchLabel}>
                Camera
              </label>
              <select
                id="camera-select"
                className={styles.cameraSelect}
                value={selectedCameraId}
                onChange={(event) => {
                  void switchCamera(event.target.value)
                }}
                disabled={!cameraReady || availableCameras.length <= 1 || isSwitchingCamera}
              >
                {availableCameras.length === 0 ? (
                  <option value="">Nenhuma camera encontrada</option>
                ) : (
                  availableCameras.map((camera, index) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${index + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className={styles.videoWrapper}>
              <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
              {!cameraReady ? <div className={styles.overlay}>Inicializando camera...</div> : null}
            </div>
            <canvas ref={canvasRef} className={styles.hiddenCanvas} />
            <div className={styles.captureActions}>
              <Button
                text="Capturar Rosto"
                onClick={captureDescriptor}
                isLoading={isCapturing}
                disabled={!cameraReady || isSaving}
              />
              <Button
                text="Confirmar Facial"
                variant="secondary"
                onClick={confirmCapture}
                isLoading={isSaving}
                disabled={!pendingCapture || !selectedParticipantId}
              />
            </div>
            {pendingCapture ? (
              <div className={styles.pendingPanel}>
                <div className={styles.pendingPreview}>
                  <img src={pendingCapture.fotoBase64} alt="Pre-visualizacao da captura facial" />
                </div>
                <label className={styles.pendingLabel} htmlFor="face-participant">
                  Colaborador correspondente
                </label>
                <select
                  id="face-participant"
                  className={styles.pendingSelect}
                  value={selectedParticipantId}
                  onChange={(event) => setSelectedParticipantId(event.target.value)}
                >
                  <option value="">Selecione um colaborador</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.nome} - {participant.cpf}
                    </option>
                  ))}
                </select>
                {pendingCapture.match ? (
                  <p className={styles.matchHint}>
                    Sugestao automatica: {pendingCapture.match.nome ?? pendingCapture.match.cpf} (
                    {pendingCapture.match.cpf})
                  </p>
                ) : (
                  <p className={styles.matchHint}>Sem correspondencia automatica.</p>
                )}
              </div>
            ) : null}
            <p className={styles.status}>{status}</p>
          </div>

          <div className={styles.listPanel}>
            <div className={styles.listHeader}>
              <h4>Colaboradores selecionados</h4>
              <span>
                {Object.keys(capturesMap).length}/{participants.length} validados
              </span>
            </div>
            <ul className={styles.participantList}>
              {participants.map((participant) => {
                const capture = capturesMap[participant.id]
                return (
                  <li key={participant.id} className={styles.participantItem}>
                    <div>
                      <strong>{participant.nome}</strong>
                      <small>{participant.cpf}</small>
                    </div>
                    <span className={capture ? styles.tagDone : styles.tagPending}>
                      {capture ? "Validado" : "Pendente"}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className={styles.finishActions}>
              <Button text="Fechar" variant="ghost" onClick={onClose} />
              <Button text="Finalizar Coleta Facial" onClick={handleComplete} disabled={!allCaptured} />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={isMatchConfirmOpen}
        onClose={handleMatchManual}
        size="md"
        title="Confirmar Colaborador Identificado"
      >
        <div className={styles.matchModalBody}>
          <p className={styles.matchModalText}>
            Rosto encontrado na base. Confirme os dados antes de vincular.
          </p>

          <div className={styles.matchBlock}>
            <h5 className={styles.matchBlockTitle}>Face reconhecida</h5>
            <div className={styles.matchGrid}>
              <span><strong>Nome:</strong> {matchedCandidate?.nome ?? "-"}</span>
              <span><strong>CPF:</strong> {matchedCandidate?.cpf ?? "-"}</span>
              <span><strong>Confianca:</strong> {matchedCandidate ? `${(matchedCandidate.confidence * 100).toFixed(1)}%` : "-"}</span>
              <span><strong>Distancia:</strong> {matchedCandidate ? matchedCandidate.distance.toFixed(4) : "-"}</span>
            </div>
          </div>

          <div className={styles.matchBlock}>
            <h5 className={styles.matchBlockTitle}>Colaborador da turma</h5>
            {matchedParticipant ? (
              <div className={styles.matchGrid}>
                <span><strong>Nome:</strong> {matchedParticipant.nome}</span>
                <span><strong>CPF:</strong> {matchedParticipant.cpf}</span>
                <span><strong>Funcao:</strong> {matchedRole}</span>
                <span><strong>Departamento:</strong> {matchedDepartment}</span>
              </div>
            ) : (
              <p className={styles.matchWarning}>
                O CPF identificado nao esta na lista selecionada para este treinamento.
              </p>
            )}
          </div>

          <div className={styles.matchModalActions}>
            <Button text="Selecionar Manualmente" variant="ghost" onClick={handleMatchManual} />
            <Button
              text="Confirmar e Salvar"
              onClick={handleConfirmMatched}
              disabled={!matchedParticipant}
              isLoading={isSaving}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

export default FacialEnrollmentModal
