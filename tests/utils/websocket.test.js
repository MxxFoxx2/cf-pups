import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeCloseWebSocket } from '../../src/utils/websocket.js';
import { WS_READY_STATE_CLOSING, WS_READY_STATE_OPEN } from '../../src/config/constants.js';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('safeCloseWebSocket', () => {
	it('closes open and closing sockets', () => {
		for (const readyState of [WS_READY_STATE_OPEN, WS_READY_STATE_CLOSING]) {
			const close = vi.fn();
			safeCloseWebSocket({ readyState, close });
			expect(close).toHaveBeenCalledTimes(1);
		}
	});

	it('leaves connecting and closed sockets alone', () => {
		for (const readyState of [0, 3]) {
			const close = vi.fn();
			safeCloseWebSocket({ readyState, close });
			expect(close).not.toHaveBeenCalled();
		}
	});

	it('swallows errors thrown while closing', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() =>
			safeCloseWebSocket({
				readyState: WS_READY_STATE_OPEN,
				close: () => {
					throw new Error('already gone');
				}
			})
		).not.toThrow();
		expect(error).toHaveBeenCalled();
	});

	it('swallows errors from a missing socket', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => safeCloseWebSocket(null)).not.toThrow();
	});
});
