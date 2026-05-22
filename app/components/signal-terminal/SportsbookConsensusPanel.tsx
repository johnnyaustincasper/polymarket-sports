'use client'

import type { SportsbookConsensus, SportsbookConsensusBook } from './types'

const C = {
  green: '#a6ff3f',
  amber: '#ffd166',
  red: '#ff4d6d',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.62)',
  faint: 'rgba(244,255,232,0.36)',
  border: 'rgba(255,255,255,0.10)',
  borderHot: 'rgba(166,255,63,0.30)',
}

export interface SportsbookConsensusPanelProps {
  consensus?: SportsbookConsensus | null
  books?: SportsbookConsensusBook[] | null
  loading?: boolean
  title?: string
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatPrice(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '—'
  const cents = Math.abs(value) <= 1 ? value * 100 : value
  const rounded = Math.round(cents * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}c`
}

function formatLine(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '—'
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function statusColor(status?: string) {
  if (status === 'available') return C.green
  if (status === 'unavailable') return C.red
  return C.amber
}

export default function SportsbookConsensusPanel({
  consensus,
  books,
  loading = false,
  title = 'Sportsbook consensus',
}: SportsbookConsensusPanelProps) {
  const rows = books ?? consensus?.books ?? []
  const status = loading ? 'pending' : consensus?.status ?? (rows.length ? 'available' : 'pending')
  const color = statusColor(status)
  const notes = consensus?.notes ?? []

  return (
    <div style={{ borderRadius: 14, padding: 12, background: 'linear-gradient(145deg, rgba(141,247,255,0.055), rgba(0,0,0,0.18))', border: `1px solid ${rows.length ? C.borderHot : C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
        <div>
          <div style={{ color: C.cyan, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{title}</div>
          {consensus?.marketName && <div style={{ color: C.text, fontSize: 11, fontWeight: 900, marginTop: 3 }}>{consensus.marketName}</div>}
        </div>
        <div style={{ color, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{loading ? 'loading' : status}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 7, marginBottom: 9 }}>
        {[
          ['Consensus', formatLine(consensus?.consensusLine ?? consensus?.averageLine), C.text],
          ['Price', formatPrice(consensus?.consensusPrice), C.green],
          ['Fair', formatPrice(consensus?.fairPrice), C.amber],
        ].map(([label, value, valueColor]) => (
          <div key={label} style={{ minWidth: 0, borderRadius: 10, padding: '7px 6px', background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.border}`, textAlign: 'center' }}>
            <div style={{ color: valueColor, fontSize: 12, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
            <div style={{ color: C.muted, fontSize: 7, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {rows.length ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.slice(0, 6).map((book) => {
            const isBest = consensus?.bestBook && book.name.toLowerCase() === consensus.bestBook.toLowerCase()
            return (
              <div key={book.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 52px 60px', gap: 8, alignItems: 'center', borderRadius: 10, padding: '7px 8px', background: isBest ? 'rgba(166,255,63,0.10)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isBest ? C.borderHot : C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: isBest ? C.green : C.text, fontSize: 10, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.name}</div>
                  <div style={{ color: C.faint, fontSize: 8, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.lean || book.lastUpdated || 'book feed'}</div>
                </div>
                <div style={{ color: C.text, fontSize: 10, fontWeight: 900, textAlign: 'right' }}>{formatLine(book.line)}</div>
                <div style={{ color: C.amber, fontSize: 10, fontWeight: 950, textAlign: 'right' }}>{book.odds ?? formatPrice(book.price)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ borderRadius: 11, padding: 10, background: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(141,247,255,0.18)', color: C.muted, fontSize: 10, lineHeight: 1.45 }}>
          Consensus provider placeholder. Wire sportsbook line aggregation here when the feed is available; this panel compiles safely with missing data.
        </div>
      )}

      {notes.length > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {notes.slice(0, 3).map((note) => <div key={note} style={{ color: C.muted, fontSize: 9, lineHeight: 1.35 }}>• {note}</div>)}
        </div>
      )}
    </div>
  )
}
