export interface CloseAttempt {
  readonly preventDefault: boolean;
  readonly requestId?: number;
}

/**
 * Serializes native close attempts with the renderer-owned document lifecycle.
 * A granted response authorizes exactly one subsequent native close event.
 */
export class WindowCloseCoordinator {
  private nextRequestId = 0;
  private pendingRequestId: number | undefined;
  private allowNextClose = false;

  handleCloseAttempt(): CloseAttempt {
    if (this.allowNextClose) {
      this.allowNextClose = false;
      return { preventDefault: false };
    }

    if (this.pendingRequestId !== undefined) {
      return { preventDefault: true };
    }

    this.pendingRequestId = ++this.nextRequestId;
    return {
      preventDefault: true,
      requestId: this.pendingRequestId,
    };
  }

  resolve(requestId: number, shouldClose: boolean): boolean {
    if (requestId !== this.pendingRequestId) {
      return false;
    }

    this.pendingRequestId = undefined;
    this.allowNextClose = shouldClose;
    return shouldClose;
  }
}
