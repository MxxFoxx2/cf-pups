import { describe, expect, it } from 'vitest';
import { isValidProxyIP, isValidSocks5, isValidUUID } from '../../src/utils/validation.js';

describe('isValidUUID', () => {
	it('accepts v1-v5 UUIDs regardless of case', () => {
		expect(isValidUUID('d342d11e-d424-4583-b36e-524ab1f0afa4')).toBe(true);
		expect(isValidUUID('D342D11E-D424-4583-B36E-524AB1F0AFA4')).toBe(true);
		expect(isValidUUID('00000000-0000-1000-8000-000000000000')).toBe(true);
		expect(isValidUUID('00000000-0000-5000-b000-000000000000')).toBe(true);
	});

	it('rejects unsupported versions and variants', () => {
		expect(isValidUUID('00000000-0000-0000-8000-000000000000')).toBe(false);
		expect(isValidUUID('00000000-0000-6000-8000-000000000000')).toBe(false);
		expect(isValidUUID('00000000-0000-4000-7000-000000000000')).toBe(false);
	});

	it('rejects malformed input', () => {
		expect(isValidUUID('')).toBe(false);
		expect(isValidUUID('not-a-uuid')).toBe(false);
		expect(isValidUUID('d342d11e-d424-4583-b36e-524ab1f0afa')).toBe(false);
		expect(isValidUUID('d342d11ed4244583b36e524ab1f0afa4')).toBe(false);
		expect(isValidUUID('d342d11e-d424-4583-b36e-524ab1f0afa4 ')).toBe(false);
	});
});

describe('isValidProxyIP', () => {
	it('accepts domain, IPv4 and bracketed IPv6 with port', () => {
		expect(isValidProxyIP('cdn.example.com:443')).toBe(true);
		expect(isValidProxyIP('1.2.3.4:8443')).toBe(true);
		expect(isValidProxyIP('[2001:db8::1]:443')).toBe(true);
	});

	it('rejects values without a port or with an oversized port', () => {
		expect(isValidProxyIP('cdn.example.com')).toBe(false);
		expect(isValidProxyIP('1.2.3.4')).toBe(false);
		expect(isValidProxyIP('1.2.3.4:123456')).toBe(false);
		expect(isValidProxyIP('2001:db8::1:443')).toBe(false);
		expect(isValidProxyIP('')).toBe(false);
	});
});

describe('isValidSocks5', () => {
	it('accepts host:port with optional credentials', () => {
		expect(isValidSocks5('example.com:1080')).toBe(true);
		expect(isValidSocks5('127.0.0.1:1080')).toBe(true);
		expect(isValidSocks5('user:pass@example.com:1080')).toBe(true);
	});

	it('rejects malformed addresses', () => {
		expect(isValidSocks5('example.com')).toBe(false);
		expect(isValidSocks5('user@example.com:1080')).toBe(false);
		expect(isValidSocks5('user:pass@:1080')).toBe(false);
		expect(isValidSocks5('')).toBe(false);
	});
});
