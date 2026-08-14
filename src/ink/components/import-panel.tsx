import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { BorderedTitleBox } from './bordered-title-box.js'
import { PresetConflictPrompt, type PresetConflictChoice } from './preset-conflict-prompt.js'
import { TextInput } from './text-input.js'
import { TruncateText } from './truncate-text.js'

export type ImportCandidateView = {
  id: string
  kind: 'template' | 'project'
  presetName: string
  projectLabel?: string
  counts: { plugins: number; skills: number; mcps: number }
  missingCount: number
}

// `conflict` is reported rather than thrown so the panel can offer the
// overwrite/rename choice without having to predict the collision itself — the
// store it would have to ask is the same one that just answered.
export type ImportOutcome =
  | { ok: true }
  | { ok: false; conflict?: boolean; error: string }

export type ImportPanelProps = {
  candidates: ImportCandidateView[]
  onImport: (id: string, targetName: string, overwrite: boolean) => Promise<ImportOutcome>
  onRenameTemplate: (id: string, newName: string) => Promise<ImportOutcome>
  onDeleteTemplate: (id: string) => Promise<ImportOutcome>
  onClose: (imported: boolean) => void
}

type PanelRow =
  | { type: 'header'; label: string }
  | { type: 'candidate'; candidate: ImportCandidateView }

type PanelMode = 'browse' | 'name' | 'conflict' | 'rename' | 'delete'

export function formatCandidateLabel(candidate: ImportCandidateView): string {
  return candidate.projectLabel
    ? `${candidate.projectLabel} / ${candidate.presetName}`
    : candidate.presetName
}

// The one thing worth knowing before importing: how much of this preset the
// current project can actually act on. The rest of its contents are visible in
// the main screen the moment it lands.
export function formatCandidateSummary(candidate: ImportCandidateView): string {
  const { plugins, skills, mcps } = candidate.counts
  const overrides = `overrides: ${plugins} plugins · ${skills} skills · ${mcps} mcps`
  return candidate.missingCount > 0
    ? `${overrides}　·　${candidate.missingCount} not installed here`
    : `${overrides}　·　all installed here`
}

export function buildPanelRows(candidates: ImportCandidateView[]): PanelRow[] {
  const rows: PanelRow[] = []
  const templates = candidates.filter(candidate => candidate.kind === 'template')
  const projects = candidates.filter(candidate => candidate.kind === 'project')

  if (templates.length > 0) {
    rows.push({ type: 'header', label: 'Global templates' })
    for (const candidate of templates) rows.push({ type: 'candidate', candidate })
  }
  if (projects.length > 0) {
    rows.push({ type: 'header', label: 'Recent projects' })
    for (const candidate of projects) rows.push({ type: 'candidate', candidate })
  }

  return rows
}

function firstSelectable(rows: PanelRow[]): number {
  return rows.findIndex(row => row.type === 'candidate')
}

// The nearest candidate row at or before `cursor`, falling back to the first
// one: headers are not selectable, and a cursor parked on one makes the panel
// look unresponsive.
function clampToSelectable(rows: PanelRow[], cursor: number): number {
  for (let next = Math.min(cursor, rows.length - 1); next >= 0; next -= 1) {
    if (rows[next]?.type === 'candidate') return next
  }
  return firstSelectable(rows)
}

function moveCursor(rows: PanelRow[], cursor: number, direction: -1 | 1): number {
  for (let next = cursor + direction; next >= 0 && next < rows.length; next += direction) {
    if (rows[next]?.type === 'candidate') return next
  }
  return cursor
}

export function ImportPanel({
  candidates,
  onImport,
  onRenameTemplate,
  onDeleteTemplate,
  onClose,
}: ImportPanelProps) {
  // Owned locally so a rename or delete is reflected without re-running
  // discovery: the panel is the only thing that changed, and re-scanning every
  // recent project to redraw one row would be absurd.
  const [items, setItems] = useState(candidates)
  const rows = buildPanelRows(items)
  const [cursor, setCursor] = useState(() => firstSelectable(rows))
  const [mode, setMode] = useState<PanelMode>('browse')
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const activeRow = rows[Math.min(cursor, Math.max(0, rows.length - 1))]
  const active = activeRow?.type === 'candidate' ? activeRow : undefined

  async function runImport(targetName: string, overwrite: boolean): Promise<void> {
    if (!active) return
    const outcome = await onImport(active.candidate.id, targetName, overwrite)
    if (outcome.ok) {
      onClose(true)
      return
    }
    if (outcome.conflict) {
      setDraftName(targetName)
      setMode('conflict')
      return
    }
    setError(outcome.error)
  }

  useInput((input, key) => {
    if (mode !== 'browse') return

    if (key.escape || input === 'q') {
      onClose(false)
      return
    }
    if (key.upArrow || input === 'k') {
      setCursor(current => moveCursor(rows, current, -1))
      setError(null)
      return
    }
    if (key.downArrow || input === 'j') {
      setCursor(current => moveCursor(rows, current, 1))
      setError(null)
      return
    }
    if (key.return) {
      if (!active) return
      void runImport(active.candidate.presetName, false)
      return
    }
    if (input === 'r') {
      if (active?.candidate.kind !== 'template') {
        setError('Only global templates can be renamed here')
        return
      }
      setDraftName(active.candidate.presetName)
      setError(null)
      setMode('rename')
      return
    }
    if (input === 'd') {
      if (active?.candidate.kind !== 'template') {
        setError('Only global templates can be deleted here')
        return
      }
      setError(null)
      setMode('delete')
    }
  })

  if (mode === 'conflict' && active) {
    return (
      <PresetConflictPrompt
        title="This project already has a preset with that name"
        existingName={draftName}
        onChoose={(choice: PresetConflictChoice) => {
          if (choice === 'cancel') {
            setMode('browse')
            return
          }
          if (choice === 'overwrite') {
            setMode('browse')
            void runImport(draftName, true)
            return
          }
          setMode('name')
        }}
      />
    )
  }

  if (mode === 'name' && active) {
    return (
      <Box flexDirection="column">
        {error ? <Text color="red">{error}</Text> : null}
        <TextInput
          label={`Import "${formatCandidateLabel(active.candidate)}" as`}
          value={draftName}
          onChange={value => {
            setError(null)
            setDraftName(value)
          }}
          onCancel={() => setMode('browse')}
          onSubmit={async () => {
            const targetName = draftName.trim()
            if (!targetName) return
            setMode('browse')
            await runImport(targetName, false)
          }}
        />
      </Box>
    )
  }

  if (mode === 'rename' && active) {
    return (
      <Box flexDirection="column">
        {error ? <Text color="red">{error}</Text> : null}
        <TextInput
          label={`Rename template ${active.candidate.presetName} to`}
          value={draftName}
          onChange={value => {
            setError(null)
            setDraftName(value)
          }}
          onCancel={() => setMode('browse')}
          onSubmit={async () => {
            const newName = draftName.trim()
            if (!newName) return
            const outcome = await onRenameTemplate(active.candidate.id, newName)
            if (!outcome.ok) {
              setError(outcome.error)
              return
            }
            setItems(current => current.map(item => (
              item.id === active.candidate.id ? { ...item, presetName: newName } : item
            )))
            setNotice(`Template renamed to ${newName}`)
            setMode('browse')
          }}
        />
      </Box>
    )
  }

  if (mode === 'delete' && active) {
    return (
      <Box flexDirection="column">
        <Text color="red">{`Delete global template ${active.candidate.presetName}?`}</Text>
        <Text dimColor>press y to confirm · esc cancel</Text>
        <ConfirmTemplateDelete
          onCancel={() => setMode('browse')}
          onConfirm={async () => {
            const outcome = await onDeleteTemplate(active.candidate.id)
            if (!outcome.ok) {
              setError(outcome.error)
              setMode('browse')
              return
            }
            const remaining = items.filter(item => item.id !== active.candidate.id)
            setItems(remaining)
            // Recomputed against the rows the deletion leaves behind, not just
            // stepped back one: removing the last template also removes its
            // group header, so the old index minus one lands on the next
            // header — a row Enter does nothing on.
            setCursor(clampToSelectable(buildPanelRows(remaining), cursor - 1))
            setNotice('Template deleted')
            setMode('browse')
          }}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">Import project launch preset</TruncateText>
      <TruncateText dimColor>j/k navigate · enter import · r rename template · d delete template · esc/q back</TruncateText>
      <BorderedTitleBox title={`Available(${items.length})`} width={78} borderColor="cyan">
        {rows.length === 0
          ? <TruncateText dimColor>nothing to import — promote a preset with s first</TruncateText>
          : rows.map((row, index) => (
            row.type === 'header'
              ? <TruncateText key={`header-${row.label}`} dimColor>{`  ${row.label}`}</TruncateText>
              : (
                <TruncateText
                  key={row.candidate.id}
                  {...(index === cursor ? { color: 'cyan' as const } : {})}
                >
                  {index === cursor ? '  ❯ ' : '    '}
                  {formatCandidateLabel(row.candidate)}
                </TruncateText>
              )
          ))}
      </BorderedTitleBox>
      {active ? <TruncateText dimColor>{formatCandidateSummary(active.candidate)}</TruncateText> : null}
      {error ? <TruncateText color="red">{error}</TruncateText> : null}
      {!error && notice ? <TruncateText color="yellow">{notice}</TruncateText> : null}
    </Box>
  )
}

function ConfirmTemplateDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (input === 'n' || key.escape) onCancel()
  })
  return null
}
