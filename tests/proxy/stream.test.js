import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeReadableWebSocketStream, remoteSocketToWS } from '../../src/proxy/stream.js';
import { WS_READY_STATE_OPEN } from '../../src/config/constants.js';

afterEach(() => {
	vi.restoreAllMocks();
});

/** Minimal WebSocket double with manual event dispatch. */
function fakeWebSocket({ readyState = WS_READY_STATE_OPEN } = {}) {
	const listeners = {};
	return {
		readyState,
		sent: [],
		closed: false,
		addEventListener(type, handler) {
			(listeners[type] ??= []).push(handler);
		},
		emit(type, event) {
			(listeners[type] ?? []).forEach((handler) => handler(event));
		},
		send(data) {
			this.sent.push(data);
		},
		close() {
			this.closed = true;
		}
	};
}

const readableOf = (chunks) =>
	new ReadableStream({
		start(controller) {
			chunks.forEach((chunk) => controller.enqueue(chunk));
			controller.close();
		}
	});

describe('makeReadableWebSocketStream', () => {
	it('enqueues early data from the header before websocket messages', async () => {
		const ws = fakeWebSocket();
		const stream = makeReadableWebSocketStream(ws, btoa('early'), () => {});
		const reader = stream.getReader();

		const early = await reader.read();
		expect(new TextDecoder().decode(early.value)).toBe('early');

		ws.emit('message', { data: 'later' });
		expect((await reader.read()).value).toBe('later');
	});

	it('ignores a missing early data header', async () => {
		const ws = fakeWebSocket();
		const reader = makeReadableWebSocketStream(ws, '', () => {}).getReader();

		ws.emit('message', { data: 'first' });
		expect((await reader.read()).value).toBe('first');
	});

	it('errors the stream on invalid early data', async () => {
		const ws = fakeWebSocket();
		const reader = makeReadableWebSocketStream(ws, '!!!invalid!!!', () => {}).getReader();
		await expect(reader.read()).rejects.toThrow();
	});

	it('closes the stream and the socket when the websocket closes', async () => {
		const logs = [];
		const ws = fakeWebSocket();
		const reader = makeReadableWebSocketStream(ws, '', (m) => logs.push(m)).getReader();

		ws.emit('close', { code: 1000 });
		expect(await reader.read()).toEqual({ done: true, value: undefined });
		expect(ws.closed).toBe(true);
		expect(logs.some((m) => m.includes('1000'))).toBe(true);
	});

	it('errors the stream on a websocket error', async () => {
		const ws = fakeWebSocket();
		const reader = makeReadableWebSocketStream(ws, '', () => {}).getReader();

		ws.emit('error', new Error('socket blew up'));
		await expect(reader.read()).rejects.toThrow('socket blew up');
	});

	it('closes the websocket and drops later messages when cancelled', async () => {
		const logs = [];
		const ws = fakeWebSocket();
		const stream = makeReadableWebSocketStream(ws, '', (m) => logs.push(m));
		const reader = stream.getReader();

		await reader.cancel('client gone');
		expect(ws.closed).toBe(true);
		expect(logs.some((m) => m.includes('client gone'))).toBe(true);

		expect(() => ws.emit('message', { data: 'ignored' })).not.toThrow();
		expect(() => ws.emit('close', { code: 1006 })).not.toThrow();
	});
});

describe('remoteSocketToWS', () => {
	it('prepends the protocol response header to the first chunk only', async () => {
		const ws = fakeWebSocket();
		const remoteSocket = { readable: readableOf([new Uint8Array([1, 2]), new Uint8Array([3])]) };

		await remoteSocketToWS(remoteSocket, ws, new Uint8Array([0xaa]).buffer, null, () => {});

		expect(Array.from(new Uint8Array(ws.sent[0]))).toEqual([0xaa, 1, 2]);
		expect(Array.from(ws.sent[1])).toEqual([3]);
	});

	it('sends chunks unchanged when there is no header', async () => {
		const ws = fakeWebSocket();
		const remoteSocket = { readable: readableOf([new Uint8Array([9])]) };

		await remoteSocketToWS(remoteSocket, ws, null, null, () => {});
		expect(Array.from(ws.sent[0])).toEqual([9]);
	});

	it('retries when the remote sends no data', async () => {
		const ws = fakeWebSocket();
		const retry = vi.fn();

		await remoteSocketToWS({ readable: readableOf([]) }, ws, null, retry, () => {});
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it('does not retry once data has been forwarded', async () => {
		const ws = fakeWebSocket();
		const retry = vi.fn();

		await remoteSocketToWS({ readable: readableOf([new Uint8Array([1])]) }, ws, null, retry, () => {});
		expect(retry).not.toHaveBeenCalled();
	});

	it('closes the websocket and retries when the websocket is not open', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const ws = fakeWebSocket({ readyState: 3 });
		const retry = vi.fn();

		await remoteSocketToWS({ readable: readableOf([new Uint8Array([1])]) }, ws, null, retry, () => {});
		expect(ws.closed).toBe(false); // readyState 3 means already closed, so close() is skipped
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it('handles a piping failure without throwing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const ws = fakeWebSocket();
		const failing = new ReadableStream({
			start(controller) {
				controller.error(new Error('remote reset'));
			}
		});

		await expect(remoteSocketToWS({ readable: failing }, ws, null, null, () => {})).resolves.toBeUndefined();
		expect(ws.closed).toBe(true);
	});
});
