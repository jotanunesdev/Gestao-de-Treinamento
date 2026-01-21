import { useCallback, useState } from 'react'

type ReadViewParams = {
  dataServerName: string
  filter?: string
  context?: string
}

type ReadViewState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

const SOAP_URL = (import.meta.env.DEV
  ? '/soap'
  : import.meta.env.VITE_READVIEW_URL) as string | undefined
const SOAP_USER = import.meta.env.VITE_READVIEW_USER as string | undefined
const SOAP_PASSWORD = import.meta.env.VITE_READVIEW_PASSWORD as string | undefined
const SOAP_ACTION = import.meta.env.VITE_READVIEW_ACTION as string | undefined
const SOAP_NAMESPACE =
  (import.meta.env.VITE_READVIEW_NAMESPACE as string | undefined) ??
  'http://www.totvs.com/'

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

type ParseMeta = {
  status?: number
  statusText?: string
  contentType?: string | null
}

function snippet(value: string, maxLength = 280) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

function buildEnvelope({ dataServerName, filter, context }: ReadViewParams) {
  const dataServer = escapeXml(dataServerName)
  const filterValue = filter ? escapeXml(filter) : ''
  const contextValue = context ? escapeXml(context) : ''

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tot="' +
      SOAP_NAMESPACE +
      '">',
    '<soapenv:Header/>',
    '<soapenv:Body>',
    '<tot:ReadView>',
    `<tot:DataServerName>${dataServer}</tot:DataServerName>`,
    filterValue ? `<tot:Filtro>${filterValue}</tot:Filtro>` : '',
    contextValue ? `<tot:Contexto>${contextValue}</tot:Contexto>` : '',
    '</tot:ReadView>',
    '</soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('')
}

function getFirstByLocalName(doc: Document, name: string) {
  const byNs = doc.getElementsByTagNameNS('*', name)
  if (byNs.length > 0) {
    return byNs[0]
  }

  const byTag = doc.getElementsByTagName(name)
  return byTag.length > 0 ? byTag[0] : null
}

function xmlElementToJson(element: Element): unknown {
  const children = Array.from(element.children)
  if (children.length === 0) {
    return element.textContent?.trim() ?? ''
  }

  const result: Record<string, unknown> = {}
  for (const child of children) {
    const key = child.localName || child.tagName
    const value = xmlElementToJson(child)
    const existing = result[key]

    if (existing === undefined) {
      result[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      result[key] = [existing, value]
    }
  }

  return result
}

function formatMeta(meta?: ParseMeta) {
  if (!meta) {
    return ''
  }

  const parts: string[] = []
  if (meta.status) {
    parts.push(`${meta.status}${meta.statusText ? ` ${meta.statusText}` : ''}`)
  }
  if (meta.contentType) {
    parts.push(meta.contentType)
  }

  return parts.length > 0 ? ` (${parts.join(' | ')})` : ''
}

function parseSoapXmlToJson(xmlText: string, meta?: ParseMeta): unknown {
  const trimmed = xmlText.trim()
  const metaInfo = formatMeta(meta)

  if (!trimmed.startsWith('<')) {
    const detail = trimmed.length > 0 ? `: ${snippet(trimmed)}` : ''
    throw new Error(`Invalid XML response${metaInfo}${detail}`)
  }

  const doc = new DOMParser().parseFromString(trimmed, 'text/xml')

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`Invalid XML response${metaInfo}: ${snippet(trimmed)}`)
  }

  const fault = getFirstByLocalName(doc, 'Fault')
  if (fault) {
    const faultString = getFirstByLocalName(doc, 'faultstring')?.textContent?.trim()
    throw new Error(faultString || 'SOAP fault')
  }

  const resultNode = getFirstByLocalName(doc, 'ReadViewResult')
  const resultText = resultNode?.textContent?.trim()
  if (resultText) {
    if (resultText.startsWith('<')) {
      const innerDoc = new DOMParser().parseFromString(resultText, 'text/xml')
      if (innerDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error(
          `Invalid XML inside ReadViewResult${metaInfo}: ${snippet(resultText)}`,
        )
      }
      return xmlElementToJson(innerDoc.documentElement)
    }

    return resultText
  }

  return xmlElementToJson(doc.documentElement)
}

export function useReadView<TData = unknown>() {
  const [state, setState] = useState<ReadViewState<TData>>({
    data: null,
    loading: false,
    error: null,
  })

  const readView = useCallback(async (params: ReadViewParams) => {
    if (import.meta.env.DEV && !import.meta.env.VITE_READVIEW_URL) {
      throw new Error('VITE_READVIEW_URL is not set for the dev proxy')
    }

    const url = requireEnv(SOAP_URL, 'VITE_READVIEW_URL')
    const user = requireEnv(SOAP_USER, 'VITE_READVIEW_USER')
    const password = requireEnv(SOAP_PASSWORD, 'VITE_READVIEW_PASSWORD')

    setState({ data: null, loading: true, error: null })

    try {
      const body = buildEnvelope(params)
      const headers: Record<string, string> = {
        Authorization: `Basic ${btoa(`${user}:${password}`)}`,
        'Content-Type': 'text/xml; charset=utf-8',
        Accept: 'text/xml, application/xml',
      }

      if (SOAP_ACTION) {
        headers.SOAPAction = SOAP_ACTION
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      })

      const text = await response.text()
      const meta: ParseMeta = {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
      }

      if (!response.ok) {
        const detail = text.trim()
        throw new Error(
          `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}` +
            (detail ? `: ${snippet(detail)}` : ''),
        )
      }

      if (text.trim().length === 0) {
        throw new Error(`Empty response${formatMeta(meta)}`)
      }

      const json = parseSoapXmlToJson(text, meta) as TData
      setState({ data: json, loading: false, error: null })
      return json
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected SOAP error'
      setState({ data: null, loading: false, error: message })
      throw error
    }
  }, [])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    readView,
  }
}
