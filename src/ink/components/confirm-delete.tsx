import { useInput } from 'ink'

// Renders nothing: every delete prompt in the app draws its own question and
// its own hint line, and only the answer is worth sharing. Kept in one place so
// the keys that mean yes and no cannot drift between screens.
export function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (input === 'n' || key.escape) onCancel()
  })
  return null
}
