/**
 * Errors thrown by platform adapters.
 *  NOT_FOUND   - the handle does not exist on that platform
 *  INVALID     - the handle is malformed
 *  UNAVAILABLE - the platform API is down, blocking us, or returned something unexpected
 */
export class AdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
