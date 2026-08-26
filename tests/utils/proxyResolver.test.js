import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	connectWithRotation,
	getCachedProxyIndex,
	resetProxyCache,
	resolveProxyAddresses,
	updateCachedProxyIndex
} from '../../src/utils/proxyResolver.js';

const dnsResponse = (answers) => ({
	ok: true,
	json: async () => ({ Answer: answers })
});

beforeEach(() => {
	resetProxyCache();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	resetProxyCache();
});

describe('resolveProxyAddresses', () => {
	it('returns literal IPv4 addresses without a DNS lookup', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		expect(await resolveProxyAddresses('1.2.3.4:8443')).toEqual([['1.2.3.4', 8443]]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('defaults the port to 443 and handles bracketed IPv6 literals', async () => {
		vi.stubGlobal('fetch', vi.fn());

		expect(await resolveProxyAddresses('1.2.3.4')).toEqual([['1.2.3.4', 443]]);
		resetProxyCache();
		expect(await resolveProxyAddresses('[2001:db8::1]:2053')).toEqual([['[2001:db8::1]', 2053]]);
	});

	it('caches results for repeated calls with the same proxyIP', async () => {
		const fetchMock = vi.fn().mockResolvedValue(dnsResponse([{ type: 1, data: '5.6.7.8' }]));
		vi.stubGlobal('fetch', fetchMock);

		const first = await resolveProxyAddresses('proxy.example.com:443');
		const second = await resolveProxyAddresses('proxy.example.com:443');

		expect(second).toBe(first);
		expect(fetchMock).toHaveBeenCalledTimes(2); // one A + one AAAA query, not repeated
	});

	it('resolves domains to A and AAAA records', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) =>
				String(url).includes('type=AAAA')
					? dnsResponse([{ type: 28, data: '2001:db8::1' }])
					: dnsResponse([{ type: 1, data: '5.6.7.8' }, { type: 5, data: 'cname.example.com' }])
			)
		);

		const addresses = await resolveProxyAddresses('proxy.example.com:2053');
		expect(addresses).toHaveLength(2);
		expect(addresses.every(([, port]) => port === 2053)).toBe(true);
		expect(addresses.map(([ip]) => ip).sort()).toEqual(['5.6.7.8', '[2001:db8::1]']);
	});

	it('falls back to the domain itself when DNS returns nothing', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		expect(await resolveProxyAddresses('proxy.example.com:443')).toEqual([['proxy.example.com', 443]]);
	});

	it('falls back to the domain itself when DNS queries throw', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		expect(await resolveProxyAddresses('proxy.example.com:443')).toEqual([['proxy.example.com', 443]]);
	});

	it('overrides the port from a .tp<port> hostname segment', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(dnsResponse([{ type: 1, data: '5.6.7.8' }])));
		expect(await resolveProxyAddresses('proxy.tp8443.example.com')).toEqual([['5.6.7.8', 8443]]);
	});

	it('lowercases the configured proxy address', async () => {
		vi.stubGlobal('fetch', vi.fn());
		expect(await resolveProxyAddresses('PROXY.EXAMPLE.COM:443')).toBeInstanceOf(Array);
	});

	it('parses TXT records for .william domains', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(dnsResponse([{ type: 16, data: '"1.2.3.4:443\\0105.6.7.8:8443, [2001:db8::1]:2053"' }]))
		);

		const addresses = await resolveProxyAddresses('list.william');
		expect(addresses).toHaveLength(3);
		expect(addresses).toEqual(
			expect.arrayContaining([
				['1.2.3.4', 443],
				['5.6.7.8', 8443],
				['[2001:db8::1]', 2053]
			])
		);
	});

	it('returns an empty list when a .william domain has no TXT records', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(dnsResponse([])));
		expect(await resolveProxyAddresses('list.william')).toEqual([]);
	});

	it('limits the result to 8 addresses', async () => {
		const answers = Array.from({ length: 12 }, (_, i) => ({ type: 1, data: `10.0.0.${i + 1}` }));
		vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('type=AAAA') ? dnsResponse([]) : dnsResponse(answers))));

		expect(await resolveProxyAddresses('proxy.example.com:443')).toHaveLength(8);
	});

	it('shuffles deterministically for the same target domain and user ID', async () => {
		const answers = Array.from({ length: 5 }, (_, i) => ({ type: 1, data: `10.0.0.${i + 1}` }));
		const fetchMock = vi.fn(async (url) => (String(url).includes('type=AAAA') ? dnsResponse([]) : dnsResponse(answers)));
		vi.stubGlobal('fetch', fetchMock);

		const first = await resolveProxyAddresses('proxy.example.com:443', 'target.example.com', 'user-1');
		resetProxyCache();
		const second = await resolveProxyAddresses('proxy.example.com:443', 'target.example.com', 'user-1');

		expect(second).toEqual(first);
	});
});

describe('proxy index cache', () => {
	it('starts at zero, is updatable and resettable', () => {
		expect(getCachedProxyIndex()).toBe(0);
		updateCachedProxyIndex(3);
		expect(getCachedProxyIndex()).toBe(3);
		resetProxyCache();
		expect(getCachedProxyIndex()).toBe(0);
	});
});

describe('connectWithRotation', () => {
	const log = () => {};

	const socketStub = (opened) => {
		const written = [];
		return {
			written,
			socket: {
				opened,
				writable: {
					getWriter: () => ({
						write: async (data) => written.push(data),
						releaseLock: () => {}
					})
				}
			}
		};
	};

	it('connects to the first working address and writes the initial data', async () => {
		const stub = socketStub(Promise.resolve());
		const connect = vi.fn(() => stub.socket);
		const initialData = new Uint8Array([1, 2, 3]);

		const result = await connectWithRotation([['1.2.3.4', 443]], initialData, connect, log);

		expect(result).toEqual({ socket: stub.socket, index: 0 });
		expect(connect).toHaveBeenCalledWith({ hostname: '1.2.3.4', port: 443 });
		expect(stub.written).toEqual([initialData]);
		expect(getCachedProxyIndex()).toBe(0);
	});

	it('rotates past failing addresses and caches the working index', async () => {
		const working = socketStub(Promise.resolve());
		const connect = vi.fn((options) => {
			if (options.hostname === 'bad.example.com') throw new Error('refused');
			return working.socket;
		});

		const result = await connectWithRotation(
			[['bad.example.com', 443], ['good.example.com', 443]],
			new Uint8Array([0]),
			connect,
			log
		);

		expect(result.index).toBe(1);
		expect(getCachedProxyIndex()).toBe(1);
	});

	it('starts from the cached index', async () => {
		updateCachedProxyIndex(1);
		const stub = socketStub(Promise.resolve());
		const connect = vi.fn(() => stub.socket);

		const result = await connectWithRotation(
			[['a.example.com', 443], ['b.example.com', 443]],
			new Uint8Array([0]),
			connect,
			log
		);

		expect(result.index).toBe(1);
		expect(connect).toHaveBeenCalledWith({ hostname: 'b.example.com', port: 443 });
	});

	it('gives up on addresses that exceed the connection timeout', async () => {
		const connect = vi.fn(() => socketStub(new Promise(() => {})).socket);
		const messages = [];

		const result = await connectWithRotation([['slow.example.com', 443]], new Uint8Array([0]), connect, (m) =>
			messages.push(m), 10);

		expect(result).toBeNull();
		expect(messages.some((m) => m.includes('Connection timeout'))).toBe(true);
	});

	it('returns null when every address fails', async () => {
		const connect = vi.fn(() => {
			throw new Error('refused');
		});

		expect(
			await connectWithRotation([['a.example.com', 443], ['b.example.com', 443]], new Uint8Array([0]), connect, log)
		).toBeNull();
	});
});
