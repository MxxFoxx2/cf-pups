import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	handleProxyConfig,
	parseEncodedQueryParams,
	parsePathProxyParams,
	parseVlessUrl,
	selectRandomAddress,
	socks5AddressParser
} from '../../src/utils/parser.js';
import { proxyIPs } from '../../src/config/defaults.js';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('parseVlessUrl', () => {
	it('rejects non-VLESS input', () => {
		expect(parseVlessUrl('')).toBeNull();
		expect(parseVlessUrl(undefined)).toBeNull();
		expect(parseVlessUrl('trojan://pass@example.com:443')).toBeNull();
		expect(parseVlessUrl('vless://example.com:443')).toBeNull();
	});

	it('parses uuid, host, port and ws/tls settings', () => {
		const parsed = parseVlessUrl(
			'vless://d342d11e-d424-4583-b36e-524ab1f0afa4@example.com:8443?type=ws&security=tls&path=%2Fws&sni=sni.example.com&host=host.example.com#label'
		);
		expect(parsed).toEqual({
			uuid: 'd342d11e-d424-4583-b36e-524ab1f0afa4',
			address: 'example.com',
			port: 8443,
			streamSettings: {
				network: 'ws',
				security: 'tls',
				wsSettings: { path: '/ws', headers: { Host: 'host.example.com' } },
				tlsSettings: { serverName: 'sni.example.com' }
			}
		});
	});

	it('defaults network, security, path and port', () => {
		const parsed = parseVlessUrl('vless://uuid@example.com');
		expect(parsed.port).toBe(443);
		expect(parsed.streamSettings).toEqual({
			network: 'ws',
			security: 'none',
			wsSettings: { path: '/' }
		});
	});

	it('falls back to the address as TLS server name', () => {
		const parsed = parseVlessUrl('vless://uuid@example.com:443?security=tls');
		expect(parsed.streamSettings.tlsSettings).toEqual({ serverName: 'example.com' });
	});

	it('parses bracketed IPv6 hosts with and without a port', () => {
		expect(parseVlessUrl('vless://uuid@[2001:db8::1]:2053')).toMatchObject({
			address: '2001:db8::1',
			port: 2053
		});
		expect(parseVlessUrl('vless://uuid@[2001:db8::1]')).toMatchObject({
			address: '2001:db8::1',
			port: 443
		});
		expect(parseVlessUrl('vless://uuid@[2001:db8::1:443')).toBeNull();
	});

	it('falls back to port 443 when the port is not a number', () => {
		expect(parseVlessUrl('vless://uuid@example.com:abc').port).toBe(443);
	});

	it('omits wsSettings for non-ws transports', () => {
		const parsed = parseVlessUrl('vless://uuid@example.com:443?type=grpc');
		expect(parsed.streamSettings.network).toBe('grpc');
		expect(parsed.streamSettings.wsSettings).toBeUndefined();
	});
});

describe('socks5AddressParser', () => {
	it('parses host:port without credentials', () => {
		expect(socks5AddressParser('example.com:1080')).toEqual({
			username: undefined,
			password: undefined,
			hostname: 'example.com',
			port: 1080
		});
	});

	it('parses credentials', () => {
		expect(socks5AddressParser('user:pass@1.2.3.4:1080')).toEqual({
			username: 'user',
			password: 'pass',
			hostname: '1.2.3.4',
			port: 1080
		});
	});

	it('parses bracketed IPv6 hosts', () => {
		expect(socks5AddressParser('[2001:db8::1]:1080')).toMatchObject({
			hostname: '[2001:db8::1]',
			port: 1080
		});
	});

	it('throws on malformed credentials, ports and unbracketed IPv6', () => {
		expect(() => socks5AddressParser('user@example.com:1080')).toThrow('Invalid SOCKS address format');
		expect(() => socks5AddressParser('example.com:notaport')).toThrow('Invalid SOCKS address format');
		expect(() => socks5AddressParser('2001:db8::1:1080')).toThrow('Invalid SOCKS address format');
	});
});

describe('selectRandomAddress', () => {
	it('accepts a comma separated string and trims entries', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		expect(selectRandomAddress('a:443, b:443, c:443')).toBe('b:443');
	});

	it('accepts an array', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(selectRandomAddress(['a:443', 'b:443'])).toBe('a:443');
	});
});

describe('handleProxyConfig', () => {
	it('picks one of the configured proxies and defaults the port', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(handleProxyConfig('proxy.example.com')).toEqual({ ip: 'proxy.example.com', port: '443' });
		expect(handleProxyConfig('a.example.com:8443, b.example.com:2053')).toEqual({
			ip: 'a.example.com',
			port: '8443'
		});
	});

	it('falls back to the default proxy list when unset', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const [host, port] = proxyIPs[0].split(':');
		expect(handleProxyConfig('')).toEqual({ ip: host, port });
	});
});

describe('parseEncodedQueryParams', () => {
	it('returns an empty object when no encoded query is present', () => {
		expect(parseEncodedQueryParams('/plain/path')).toEqual({});
	});

	it('decodes encoded parameters', () => {
		expect(parseEncodedQueryParams('/path%3Fproxyip=1.2.3.4%3A443&ed=2048')).toEqual({
			proxyip: '1.2.3.4:443',
			ed: '2048'
		});
	});

	it('skips valueless parameters', () => {
		expect(parseEncodedQueryParams('/path%3Fflag&ed=2048')).toEqual({ ed: '2048' });
	});
});

describe('parsePathProxyParams', () => {
	const empty = { proxyip: null, socks5: null, http: null, vless: null, globalProxy: false };

	it('returns defaults for unrelated paths', () => {
		expect(parsePathProxyParams('/')).toEqual(empty);
		expect(parsePathProxyParams('/sub/uuid')).toEqual(empty);
	});

	it('parses proxyip variants', () => {
		expect(parsePathProxyParams('/proxyip=1.2.3.4:443')).toMatchObject({ proxyip: '1.2.3.4:443' });
		expect(parsePathProxyParams('/pyip=1.2.3.4:443')).toMatchObject({ proxyip: '1.2.3.4:443' });
		expect(parsePathProxyParams('/ip=1.2.3.4:443')).toMatchObject({ proxyip: '1.2.3.4:443' });
		expect(parsePathProxyParams('/proxyip.example.com')).toMatchObject({ proxyip: 'proxyip.example.com' });
	});

	it('parses socks5 URL form and enables global proxy', () => {
		expect(parsePathProxyParams('/socks5://user:pass@1.2.3.4:1080')).toMatchObject({
			socks5: 'user:pass@1.2.3.4:1080',
			globalProxy: true
		});
		expect(parsePathProxyParams('/socks://1.2.3.4:1080')).toMatchObject({
			socks5: '1.2.3.4:1080',
			globalProxy: true
		});
	});

	it('base64-decodes socks5 credentials, including %3D padding', () => {
		expect(parsePathProxyParams('/socks5://dXNlcjpwYXNz@1.2.3.4:1080').socks5).toBe('user:pass@1.2.3.4:1080');
		expect(parsePathProxyParams('/socks5://dXNlcjpwdw%3D%3D@1.2.3.4:1080').socks5).toBe('user:pw@1.2.3.4:1080');
	});

	it('parses socks5 equals form and only globalizes the g-prefixed variants', () => {
		expect(parsePathProxyParams('/socks5=1.2.3.4:1080')).toMatchObject({
			socks5: '1.2.3.4:1080',
			globalProxy: false
		});
		expect(parsePathProxyParams('/s5=1.2.3.4:1080')).toMatchObject({ socks5: '1.2.3.4:1080', globalProxy: false });
		expect(parsePathProxyParams('/gs5=1.2.3.4:1080')).toMatchObject({ socks5: '1.2.3.4:1080', globalProxy: true });
		expect(parsePathProxyParams('/gsocks5=1.2.3.4:1080')).toMatchObject({ globalProxy: true });
	});

	it('parses http proxy forms', () => {
		expect(parsePathProxyParams('/http://user:pass@1.2.3.4:8080')).toMatchObject({
			http: 'user:pass@1.2.3.4:8080',
			globalProxy: true
		});
		expect(parsePathProxyParams('/http=1.2.3.4:8080')).toMatchObject({
			http: '1.2.3.4:8080',
			globalProxy: false
		});
		expect(parsePathProxyParams('/ghttp=1.2.3.4:8080')).toMatchObject({ globalProxy: true });
	});

	it('parses vless outbound forms', () => {
		expect(parsePathProxyParams('/vless://uuid@example.com:443')).toMatchObject({
			vless: 'vless://uuid@example.com:443',
			globalProxy: true
		});
		expect(parsePathProxyParams('/vless=vless%3A%2F%2Fuuid%40example.com%3A443')).toMatchObject({
			vless: 'vless://uuid@example.com:443',
			globalProxy: false
		});
		expect(parsePathProxyParams('/gvless=vless%3A%2F%2Fuuid%40example.com%3A443')).toMatchObject({
			globalProxy: true
		});
	});

	it('gives proxyip precedence over later patterns', () => {
		expect(parsePathProxyParams('/proxyip=1.2.3.4:443/socks5=5.6.7.8:1080')).toMatchObject({
			proxyip: '1.2.3.4:443',
			socks5: null
		});
	});
});
