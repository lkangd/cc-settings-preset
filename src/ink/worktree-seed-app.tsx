import { Box, Text, useApp, useInput } from 'ink'
import { BorderedTitleBox } from './components/bordered-title-box.js'
import { TruncateText } from './components/truncate-text.js'

export type WorktreeSeedResult = 'accept' | 'decline'

export type WorktreeSeedAppProps = {
  mainRoot: string
  presetNames: string[]
  lastUsedName?: string
  onSubmit: (result: WorktreeSeedResult) => void
}

// A full-screen question rather than a hint on the main screen: it is asked once
// in a worktree's life, and a soft prompt competing with four columns of toggles
// is exactly the kind of thing that gets skipped — after which the user rebuilds
// the presets by hand, which is the whole problem.
export function WorktreeSeedApp({ mainRoot, presetNames, lastUsedName, onSubmit }: WorktreeSeedAppProps) {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'y' || key.return) {
      onSubmit('accept')
      exit()
      return
    }
    if (input === 'n' || input === 'q' || key.escape) {
      onSubmit('decline')
      exit()
    }
  })

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">Inherit project launch presets?</TruncateText>
      <TruncateText dimColor>{`This worktree has none of its own. Its main repository is ${mainRoot}`}</TruncateText>
      <BorderedTitleBox title={`Presets(${presetNames.length})`} width={78} borderColor="cyan">
        {presetNames.map(name => (
          <TruncateText key={name}>
            {'  '}
            {name}
            {name === lastUsedName ? <Text dimColor> (last used)</Text> : null}
          </TruncateText>
        ))}
      </BorderedTitleBox>
      <TruncateText dimColor>Copies are independent — changing them here will not affect the main repository.</TruncateText>
      <TruncateText>press y to inherit · n to skip (you will not be asked again)</TruncateText>
    </Box>
  )
}
