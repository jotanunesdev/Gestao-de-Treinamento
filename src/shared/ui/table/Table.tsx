import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import styles from "./table.module.css"
import Input from "../input/Input"
import Button from "../button/Button"

export type TableColumn<T> = {
  key: keyof T | string
  header: string
  align?: "left" | "center" | "right"
  width?: string
  render?: (row: T, index: number) => ReactNode
  className?: string
  headerClassName?: string
}

type TableProps<T extends Record<string, unknown>> = {
  columns: TableColumn<T>[]
  data: T[]
  caption?: string
  emptyMessage?: string
  getRowId?: (row: T, index: number) => string
  className?: string
  dense?: boolean
  searchable?: boolean
  searchLabel?: string
  searchPlaceholder?: string
  searchButtonLabel?: string
  searchableKeys?: Array<keyof T | string>
  paginated?: boolean
  pageSize?: number
  selectable?: boolean
  selectedRowIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
}

const alignClasses = {
  left: styles.alignLeft,
  center: styles.alignCenter,
  right: styles.alignRight,
}

function Table<T extends Record<string, unknown>>({
  columns,
  data,
  caption,
  emptyMessage = "Sem dados para exibir.",
  getRowId,
  className,
  dense = false,
  searchable = true,
  searchLabel = "Buscar",
  searchPlaceholder = "Digite para buscar",
  searchButtonLabel = "Buscar",
  searchableKeys,
  paginated = true,
  pageSize = 15,
  selectable = false,
  selectedRowIds,
  onSelectionChange,
}: TableProps<T>) {
  const colSpan = Math.max(columns.length + (selectable ? 1 : 0), 1)
  const searchId = useId()
  const [searchDraft, setSearchDraft] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  const selectedIds = selectedRowIds ?? internalSelectedIds

  const filterKeys = useMemo(() => {
    if (searchableKeys && searchableKeys.length > 0) {
      return searchableKeys
    }

    return columns.map((column) => column.key)
  }, [columns, searchableKeys])

  const filteredRows = useMemo(() => {
    if (!searchable) {
      return data.map((row, index) => ({ row, index }))
    }

    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      return data.map((row, index) => ({ row, index }))
    }

    const normalize = (value: unknown): string => {
      if (value === null || value === undefined) return ""
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value)
      }
      if (Array.isArray(value)) {
        return value.map(normalize).join(" ")
      }
      if (value instanceof Date) {
        return value.toISOString()
      }

      return ""
    }

    return data
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        filterKeys.some((key) => {
          const rawValue = row[key as keyof T]
          const text = normalize(rawValue).toLowerCase()
          return text.includes(term)
        }),
      )
  }, [data, filterKeys, searchTerm, searchable])

  useEffect(() => {
    if (!paginated) return
    setCurrentPage(1)
  }, [searchTerm, paginated])

  const resolvedPageSize = Math.max(1, pageSize)
  const totalRows = filteredRows.length
  const totalPages = paginated ? Math.max(1, Math.ceil(totalRows / resolvedPageSize)) : 1

  useEffect(() => {
    if (!paginated) return
    setCurrentPage((prev) => Math.min(prev, totalPages))
  }, [paginated, totalPages])

  const pageStart = paginated ? (currentPage - 1) * resolvedPageSize : 0
  const pageEnd = paginated ? pageStart + resolvedPageSize : totalRows
  const pagedRows = paginated ? filteredRows.slice(pageStart, pageEnd) : filteredRows

  const rowIds = useMemo(() => {
    return pagedRows.map(({ row, index }) =>
      getRowId ? getRowId(row, index) : String(index),
    )
  }, [pagedRows, getRowId])

  const allSelected =
    selectable && rowIds.length > 0 && rowIds.every((rowId) => selectedIds.includes(rowId))
  const someSelected =
    selectable && rowIds.some((rowId) => selectedIds.includes(rowId)) && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = Boolean(someSelected)
    }
  }, [someSelected])

  const updateSelection = (nextIds: string[]) => {
    if (selectedRowIds === undefined) {
      setInternalSelectedIds(nextIds)
    }
    onSelectionChange?.(nextIds)
  }

  const handleSelectAll = () => {
    if (!selectable) return

    if (allSelected) {
      const next = selectedIds.filter((id) => !rowIds.includes(id))
      updateSelection(next)
    } else {
      const next = Array.from(new Set([...selectedIds, ...rowIds]))
      updateSelection(next)
    }
  }

  const handleToggleRow = (rowId: string) => {
    if (!selectable) return

    if (selectedIds.includes(rowId)) {
      updateSelection(selectedIds.filter((id) => id !== rowId))
    } else {
      updateSelection([...selectedIds, rowId])
    }
  }

  return (
    <div className={`${styles.tableWrapper} ${dense ? styles.dense : ""} ${className ?? ""}`}>
      {searchable ? (
        <div className={styles.controls}>
          <div className={styles.searchInput}>
            <Input
              name={searchId}
              label={searchLabel}
              placeholder={searchPlaceholder}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </div>
          <div className={styles.searchButton}>
            <Button text={searchButtonLabel} onClick={() => setSearchTerm(searchDraft)} />
          </div>
        </div>
      ) : null}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          {caption ? <caption className={styles.caption}>{caption}</caption> : null}
          <thead className={styles.thead}>
            <tr className={styles.headerRow}>
              {selectable ? (
                <th className={`${styles.th} ${styles.checkboxHeader}`} scope="col">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className={styles.checkbox}
                    checked={allSelected}
                    onChange={handleSelectAll}
                    aria-label="Selecionar todos"
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const alignClass = alignClasses[column.align ?? "left"]
                return (
                  <th
                    key={String(column.key)}
                    scope="col"
                    className={`${styles.th} ${alignClass} ${column.headerClassName ?? ""}`}
                    style={column.width ? { width: column.width } : undefined}
                  >
                    {column.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className={styles.tbody}>
            {pagedRows.length ? (
              pagedRows.map(({ row, index }) => {
                const rowId = getRowId ? getRowId(row, index) : String(index)
                const rowKey = rowId || `${index}-${columns.length}`
                return (
                  <tr key={rowKey} className={styles.row}>
                    {selectable ? (
                      <td className={`${styles.td} ${styles.checkboxCell}`}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selectedIds.includes(rowId)}
                          onChange={() => handleToggleRow(rowId)}
                          aria-label={`Selecionar linha ${index + 1}`}
                        />
                      </td>
                    ) : null}
                    {columns.map((column, colIndex) => {
                      const alignClass = alignClasses[column.align ?? "left"]
                      const value = column.render
                        ? column.render(row, index)
                        : (row[column.key as keyof T] as ReactNode)
                      return (
                        <td
                          key={`${rowKey}-${String(column.key)}-${colIndex}`}
                          className={`${styles.td} ${alignClass} ${column.className ?? ""}`}
                        >
                          {value ?? "-"}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            ) : (
              <tr className={styles.emptyRow}>
                <td className={`${styles.td} ${styles.emptyCell}`} colSpan={colSpan}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paginated && totalPages > 1 ? (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Mostrando {totalRows === 0 ? 0 : pageStart + 1}-
            {Math.min(pageEnd, totalRows)} de {totalRows}
          </span>
          <div className={styles.paginationActions}>
            <Button
              text="Anterior"
              variant="ghost"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            />
            <span className={styles.paginationPage}>
              Pagina {currentPage} de {totalPages}
            </span>
            <Button
              text="Proxima"
              variant="ghost"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Table
