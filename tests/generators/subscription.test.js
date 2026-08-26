import { describe, expect, it } from 'vitest';
import { genSub, genTrojanSub } from '../../src/generators/subscription.js';
import { HttpPort, HttpsPort } from '../../src/config/constants.js';
import { proxyIPs } from '../../src/config/defaults.js';

const UUID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';
const decode = (sub) => atob(sub).split('\n');

describe('genSub', () => {
	it('returns base64 encoded, newline separated URLs', () => {
		const lines = decode(genSub(UUID, 'worker.example.workers.dev', '1.2.3.4:443'));
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.every((line) => line.startsWith('vless://') || line.startsWith('trojan://'))).toBe(true);
	});

	it('emits both HTTP and HTTPS VLESS URLs for regular hostnames', () => {
		const lines = decode(genSub(UUID, 'worker.example.workers.dev', '1.2.3.4:443'));
		const vless = lines.filter((line) => line.startsWith('vless://'));
		expect(vless.some((line) => line.includes('-HTTP-80'))).toBe(true);
		expect(vless.some((line) => line.includes('-HTTPS-443'))).toBe(true);
		expect(vless.every((line) => line.includes(`://${UUID}@`))).toBe(true);
	});

	it('omits plain HTTP URLs for pages.dev hosts', () => {
		const lines = decode(genSub(UUID, 'site.pages.dev', '1.2.3.4:443'));
		expect(lines.some((line) => line.includes('-HTTP-'))).toBe(false);
		expect(lines.some((line) => line.includes('-HTTPS-'))).toBe(true);
	});

	it('generates URLs for every UUID in a comma separated list', () => {
		const second = '00000000-0000-4000-8000-000000000000';
		const lines = decode(genSub(`${UUID},${second}`, 'site.pages.dev', '1.2.3.4:443'));
		expect(lines.some((line) => line.includes(`://${UUID}@`))).toBe(true);
		expect(lines.some((line) => line.includes(`://${second}@`))).toBe(true);
	});

	it('accepts proxy IPs as a string, comma separated string or array', () => {
		const fromString = decode(genSub(UUID, 'site.pages.dev', '1.2.3.4:8443'));
		expect(fromString.some((line) => line.includes('1.2.3.4:8443'))).toBe(true);

		const fromList = decode(genSub(UUID, 'site.pages.dev', '1.2.3.4:8443,5.6.7.8:2053'));
		expect(fromList.some((line) => line.includes('5.6.7.8:2053'))).toBe(true);

		const fromArray = decode(genSub(UUID, 'site.pages.dev', ['9.9.9.9:2083']));
		expect(fromArray.some((line) => line.includes('9.9.9.9:2083'))).toBe(true);
	});

	it('defaults the proxy list and proxy port', () => {
		const lines = decode(genSub(UUID, 'site.pages.dev', null));
		expect(lines.some((line) => line.includes(proxyIPs[0]))).toBe(true);

		const noPort = decode(genSub(UUID, 'site.pages.dev', 'proxy.example.com'));
		expect(noPort.some((line) => line.includes('proxy.example.com:443'))).toBe(true);
	});

	it('uses the first UUID as the Trojan password unless one is given', () => {
		const withDefault = decode(genSub(UUID, 'site.pages.dev', '1.2.3.4:443'));
		expect(withDefault.some((line) => line.startsWith(`trojan://${UUID}@`))).toBe(true);

		const withPassword = decode(genSub(UUID, 'site.pages.dev', '1.2.3.4:443', 'p@ss word'));
		expect(withPassword.some((line) => line.startsWith('trojan://p%40ss%20word@'))).toBe(true);
	});
});

describe('genTrojanSub', () => {
	it('only emits Trojan URLs on HTTPS ports plus the proxy addresses', () => {
		const lines = decode(genTrojanSub('secret', 'site.pages.dev', '1.2.3.4:8443'));
		expect(lines.every((line) => line.startsWith('trojan://secret@'))).toBe(true);
		expect(lines).toHaveLength(HttpsPort.size + 1);
		expect(lines.some((line) => line.includes('1.2.3.4:8443'))).toBe(true);
		expect(lines.some((line) => Array.from(HttpPort).some((port) => line.includes(`:${port}`)))).toBe(false);
	});

	it('falls back to the default proxy list', () => {
		const lines = decode(genTrojanSub('secret', 'site.pages.dev', ''));
		expect(lines).toHaveLength(HttpsPort.size + proxyIPs.length);
	});

	it('includes TLS websocket parameters', () => {
		const [first] = decode(genTrojanSub('secret', 'site.pages.dev', '1.2.3.4:443'));
		expect(first).toContain('security=tls');
		expect(first).toContain('type=ws');
		expect(first).toContain('sni=site.pages.dev');
	});
});
