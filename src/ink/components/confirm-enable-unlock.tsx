import { useInput } from 'ink'
import { TruncateText } from './truncate-text.js'

export function ConfirmEnableUnlock({
  filePath,
  requiredPlugin,
  itemName,
  onConfirm,
  onCancel,
}: {
  filePath?: string
  requiredPlugin?: string
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (input === 'n' || key.return || key.escape) onCancel()
  })

  if (requiredPlugin) {
    return (
      <>
        <TruncateText color="yellow">MCP {itemName} requires plugin {requiredPlugin} to be enabled.</TruncateText>
        {filePath ? <TruncateText color="yellow">Plugin disabled in {filePath}</TruncateText> : null}
        <TruncateText color="yellow">Enable plugin to use this MCP? (y/N)</TruncateText>
        <TruncateText dimColor>press y to enable · Enter/n cancel · esc cancel</TruncateText>
      </>
    )
  }

  return (
    <>
      <TruncateText color="yellow">Disabled in {filePath}</TruncateText>
      <TruncateText color="yellow">Remove this disable entry? (y/N)</TruncateText>
      <TruncateText dimColor>press y to remove · Enter/n cancel · esc cancel</TruncateText>
    </>
  )
}
