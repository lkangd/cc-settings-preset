export type CliErrorCode =
  | 'preset_already_exists'
  | 'launch_preset_already_exists'
  | 'launch_preset_not_found'

export class CliError extends Error {
  readonly exitCode: number
  readonly code: CliErrorCode | undefined

  constructor(message: string, exitCode = 1, code?: CliErrorCode) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
    this.code = code
  }

  static is(error: unknown, code: CliErrorCode): string | undefined {
    if (!(error instanceof CliError)) return undefined
    return error.code === code ? error.message : undefined
  }
}
