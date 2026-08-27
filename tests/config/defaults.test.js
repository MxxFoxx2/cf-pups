import { describe, expect, it } from 'vitest';
import {
	createRequestConfig,
	defaultProxyTimeout,
	defaultUserID
} from '../../src/config/defaults.js';

describe('createRequestConfig', () => {
	it('falls back to defaults when no env is provided', () => {
		const config = createRequestConfig();
		expect(config).toMatchObject({
			userID: defaultUserID,
			trojanPassword: defaultUserID,
			socks5Address: '',
			socks5Relay: false,
			proxyIP: null,
			proxyPort: null,
			proxyType: null,
			parsedProxyAddress: null,
			proxyTimeout: defaultProxyTimeout,
			enableProxyFallback: true,
			vlessOutbound: '',
			parsedVlessOutbound: null
		});
	});

	it('uses env values when provided', () => {
		const config = createRequestConfig({
			UUID: '00000000-0000-4000-8000-000000000000',
			SOCKS5: 'user:pass@1.2.3.4:1080',
			SOCKS5_RELAY: 'true',
			TROJAN_PASSWORD: 'secret',
			PROXY_TIMEOUT: '2500',
			PROXY_FALLBACK: 'false',
			VLESS_OUTBOUND: 'vless://uuid@example.com:443'
		});
		expect(config).toMatchObject({
			userID: '00000000-0000-4000-8000-000000000000',
			trojanPassword: 'secret',
			socks5Address: 'user:pass@1.2.3.4:1080',
			socks5Relay: true,
			proxyTimeout: 2500,
			enableProxyFallback: false,
			vlessOutbound: 'vless://uuid@example.com:443'
		});
	});

	it('derives the trojan password from the user ID when unset', () => {
		const config = createRequestConfig({ UUID: 'custom-uuid' });
		expect(config.trojanPassword).toBe('custom-uuid');
	});

	it('only enables socks5 relay for the exact string "true"', () => {
		expect(createRequestConfig({ SOCKS5_RELAY: 'TRUE' }).socks5Relay).toBe(false);
		expect(createRequestConfig({ SOCKS5_RELAY: '1' }).socks5Relay).toBe(false);
	});

	it('only disables proxy fallback for the exact string "false"', () => {
		expect(createRequestConfig({ PROXY_FALLBACK: 'no' }).enableProxyFallback).toBe(true);
	});
});
