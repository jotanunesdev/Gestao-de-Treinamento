const SECTOR_DEFINITIONS = [
  {
    key: "ti",
    label: "TI",
    aliases: [
      "ti",
      "tic",
      "tecnologia da informacao",
      "tecnologia da informação",
      "tecnologia da informacao e comunicacao",
      "tecnologia da informação e comunicação",
      "tecnologia",
    ],
  },
  {
    key: "sesmt",
    label: "SESMT",
    aliases: [
      "sesmt",
      "seguranca do trabalho",
      "segurança do trabalho",
      "saude e seguranca",
      "saúde e segurança",
    ],
  },
  {
    key: "qualidade",
    label: "Qualidade",
    aliases: [
      "qualidade",
      "gestao da qualidade",
      "gestão da qualidade",
      "qualidade e processos",
      "processos e qualidade",
    ],
  },
  {
    key: "recursos-humanos",
    label: "Recursos Humanos",
    aliases: [
      "recursos humanos",
      "rh",
      "gente e gestao",
      "gente e gestão",
      "departamento pessoal",
      "administracao de pessoal",
      "administração de pessoal",
      "adm pessoal",
      "adm. pessoal",
      "dp",
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    aliases: ["financeiro", "setor financeiro", "departamento financeiro"],
  },
  {
    key: "contabilidade",
    label: "Contabilidade",
    aliases: ["contabilidade", "contabil", "setor contabil", "setor contabilidade"],
  },
  {
    key: "inovacao",
    label: "Inovacao",
    aliases: ["inovacao", "inovação"],
  },
  {
    key: "diretoria",
    label: "Diretoria",
    aliases: ["diretoria", "diretoria executiva"],
  },
] as const

const MULTI_SECTOR_RULES = [
  {
    aliases: ["gerencia financeira", "gerência financeira"],
    sectorKeys: ["financeiro", "contabilidade"],
  },
] as const

type SectorDefinition = (typeof SECTOR_DEFINITIONS)[number]

function escapeSectorPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function normalizeSectorText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function matchesSectorAlias(normalizedValue: string, alias: string) {
  const normalizedAlias = normalizeSectorText(alias)

  if (!normalizedValue || !normalizedAlias) {
    return false
  }

  if (normalizedValue === normalizedAlias) {
    return true
  }

  if (normalizedAlias.includes(" ")) {
    return normalizedValue.includes(normalizedAlias)
  }

  return new RegExp(`(^|[^a-z0-9])${escapeSectorPattern(normalizedAlias)}([^a-z0-9]|$)`).test(
    normalizedValue,
  )
}

function findSectorDefinitionByKey(value: string | null | undefined): SectorDefinition | null {
  const normalizedValue = normalizeSectorText(value)
  if (!normalizedValue) {
    return null
  }

  return (
    SECTOR_DEFINITIONS.find(
      (item) =>
        item.key === normalizedValue || normalizeSectorText(item.label) === normalizedValue,
    ) ?? null
  )
}

export function resolveSectorDefinition(value: string | null | undefined): SectorDefinition | null {
  const normalizedValue = normalizeSectorText(value)
  if (!normalizedValue) {
    return null
  }

  return (
    findSectorDefinitionByKey(normalizedValue) ??
    SECTOR_DEFINITIONS.find((item) =>
      item.aliases.some((alias) => matchesSectorAlias(normalizedValue, alias)),
    ) ??
    null
  )
}

export function resolveAccessibleSectorKeys(value: string | null | undefined) {
  const normalizedValue = normalizeSectorText(value)
  if (!normalizedValue) {
    return [] as string[]
  }

  const directSectorKey = resolveSectorDefinition(normalizedValue)?.key
  if (directSectorKey) {
    return [directSectorKey]
  }

  for (const rule of MULTI_SECTOR_RULES) {
    if (rule.aliases.some((alias) => matchesSectorAlias(normalizedValue, alias))) {
      return [...rule.sectorKeys]
    }
  }

  return [] as string[]
}

export function resolveSectorDefinitionFromModuleName(moduleName: string | null | undefined) {
  const normalizedName = normalizeSectorText(moduleName)
  if (!normalizedName) {
    return null
  }

  return (
    SECTOR_DEFINITIONS.find((sector) => {
      const candidates = [
        sector.label,
        `Treinamentos - ${sector.label}`,
        `Modulo ${sector.label}`,
        `Modulo de ${sector.label}`,
      ].map(normalizeSectorText)

      return (
        candidates.includes(normalizedName) ||
        normalizedName.includes(normalizeSectorText(sector.label)) ||
        normalizedName.includes(normalizeSectorText(sector.key))
      )
    }) ?? null
  )
}
