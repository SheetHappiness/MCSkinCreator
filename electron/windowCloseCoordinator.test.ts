import { describe, expect, it } from 'vitest';

import { WindowCloseCoordinator } from './windowCloseCoordinator';

describe('WindowCloseCoordinator', () => {
  it('requests one decision for duplicate close attempts', () => {
    const coordinator = new WindowCloseCoordinator();

    expect(coordinator.handleCloseAttempt()).toEqual({
      preventDefault: true,
      requestId: 1,
    });
    expect(coordinator.handleCloseAttempt()).toEqual({ preventDefault: true });
  });

  it('keeps the window open after cancellation or a stale response', () => {
    const coordinator = new WindowCloseCoordinator();
    coordinator.handleCloseAttempt();

    expect(coordinator.resolve(2, true)).toBe(false);
    expect(coordinator.resolve(1, false)).toBe(false);
    expect(coordinator.handleCloseAttempt()).toEqual({
      preventDefault: true,
      requestId: 2,
    });
  });

  it('authorizes exactly one close after a successful decision', () => {
    const coordinator = new WindowCloseCoordinator();
    coordinator.handleCloseAttempt();

    expect(coordinator.resolve(1, true)).toBe(true);
    expect(coordinator.handleCloseAttempt()).toEqual({ preventDefault: false });
    expect(coordinator.handleCloseAttempt()).toEqual({
      preventDefault: true,
      requestId: 2,
    });
  });
});
