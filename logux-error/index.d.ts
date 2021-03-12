type Versions = {
  supported: string
  used: string
}

export type LoguxErrorOptions = {
  'timeout': number
  'bruteforce': void
  'wrong-format': string
  'wrong-protocol': Versions
  'unknown-message': string
  'wrong-credentials': void
  'wrong-subprotocol': Versions
}

/**
 * Logux error in logs synchronization.
 *
 * ```js
 * if (error.name === 'LoguxError') {
 *   console.log('Server throws: ' + error.description)
 * }
 * ```
 */
export class LoguxError<
  T extends keyof LoguxErrorOptions = keyof LoguxErrorOptions
> extends Error {
  /**
   * Return a error description by it code.
   *
   * @param type The error code.
   * @param options The errors options depends on error code.
   *
   * ```js
   * errorMessage(msg) {
   *   console.log(LoguxError.describe(msg[1], msg[2]))
   * }
   * ```
   */
  static description<K extends keyof LoguxErrorOptions>(
    type: K,
    options?: LoguxErrorOptions[K]
  ): string

  /**
   * @param type The error code.
   * @param options The error option.
   * @param received Was error received from remote node.
   */
  constructor(type: T, options?: LoguxErrorOptions[T], received?: boolean)

  /**
   * Always equal to `LoguxError`. The best way to check error class.
   *
   * ```js
   * if (error.name === 'LoguxError') {
   * ```
   */
  name: 'LoguxError'

  /**
   * Full text of error to print in debug message.
   */
  message: string

  /**
   * Calls which cause the error.
   */
  stack: string

  /**
   * The error code.
   *
   * ```js
   * if (error.type === 'timeout') {
   *   fixNetwork()
   * }
   * ```
   */
  type: T

  /**
   * Error options depends on error type.
   *
   * ```js
   * if (error.type === 'timeout') {
   *   console.error('A timeout was reached (' + error.options + ' ms)')
   * }
   * ```
   */
  options: LoguxErrorOptions[T]

  /**
   * Human-readable error description.
   *
   * ```js
   * console.log('Server throws: ' + error.description)
   * ```
   */
  description: string

  /**
   * Was error received from remote client.
   */
  received: boolean
}
