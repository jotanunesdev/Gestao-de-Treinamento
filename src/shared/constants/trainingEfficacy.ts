export const TRAINING_EFFICACY_QUESTION =
  "Apos a realizacao deste treinamento, voce percebe melhoria na sua capacidade de aplicar os conhecimentos adquiridos em suas atividades diarias de trabalho ?"

export const TRAINING_EFFICACY_OPTIONS = [
  { value: 1, label: "Nao Percebo melhoria" },
  { value: 2, label: "Pequena Melhoria" },
  { value: 3, label: "Melhoria Moderada" },
  { value: 4, label: "Grande Melhoria" },
  { value: 5, label: "Melhoria Significativa" },
] as const

export type TrainingEfficacyLevel = (typeof TRAINING_EFFICACY_OPTIONS)[number]["value"]
