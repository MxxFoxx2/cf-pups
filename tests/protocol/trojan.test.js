import { describe, expect, it } from 'vitest';
import { isTrojanProtocol, processTrojanHeader } from '../../src/protocol/trojan.js';
import { sha224 } from '../../src/utils/crypto.js';

const PASSWORD = 'trojan-password';

/**
 * Builds a Trojan request header:
 * hash(56) | CRLF | command | addrType | address | port(2) | CRLF | payload
 */
function buildHeader({
	password = PASSWORD,
	command = 0x01,
	addressType = 3,
	address = 'example.com',
	port = 443,
	payload = [],
	crlf = [0x0d, 0x0a],
	finalCrlf = [0x0d, 0x0a],
	truncateAt = null
} = {}) {
	const bytes = [...new TextEncoder().encode(sha224(password)), ...crlf, command, addressType];

	if (addressType === 1) {
		bytes.push(...address.split('.').map(Number));
	} else if (addressType === 3) {
		const encoded = Array.from(new TextEncoder().encode(address));
		bytes.push(encoded.length, ...encoded);
	} else if (addressType === 4) {
		bytes.push(...address);
	} else {
		bytes.push(...address);
	}

	bytes.push(port >> 8, port & 0xff, ...finalCrlf, ...payload);
	const all = truncateAt === null ? bytes : bytes.slice(0, truncateAt);
	return new Uint8Array(all).buffer;
}

describe('isTrojanProtocol', () => {
	it('accepts a well-formed header with a matching password', () => {
		expect(isTrojanProtocol(buildHeader(), PASSWORD)).toBe(true);
	});

	it('rejects short buffers', () => {
		expect(isTrojanProtocol(new ArrayBuffer(57), PASSWORD)).toBe(false);
	});

	it('rejects a missing CRLF', () => {
		expect(isTrojanProtocol(buildHeader({ crlf: [0x00, 0x00] }), PASSWORD)).toBe(false);
	});

	it('rejects a password mismatch', () => {
		expect(isTrojanProtocol(buildHeader({ password: 'other' }), PASSWORD)).toBe(false);
	});
});

describe('processTrojanHeader', () => {
	it('rejects short buffers', () => {
		expect(processTrojanHeader(new ArrayBuffer(10), PASSWORD)).toEqual({
			hasError: true,
			message: 'Invalid Trojan data: too short'
		});
	});

	it('rejects a wrong password', () => {
		expect(processTrojanHeader(buildHeader({ password: 'other' }), PASSWORD)).toEqual({
			hasError: true,
			message: 'Invalid Trojan password'
		});
	});

	it('rejects a missing header CRLF', () => {
		expect(processTrojanHeader(buildHeader({ crlf: [0x00, 0x00] }), PASSWORD)).toEqual({
			hasError: true,
			message: 'Invalid Trojan header: missing CRLF'
		});
	});

	it('rejects unsupported commands', () => {
		expect(processTrojanHeader(buildHeader({ command: 0x02 }), PASSWORD)).toEqual({
			hasError: true,
			message: 'Unsupported Trojan command: 2'
		});
	});

	it('rejects unknown address types', () => {
		expect(processTrojanHeader(buildHeader({ addressType: 9, address: [1, 2, 3, 4] }), PASSWORD)).toEqual({
			hasError: true,
			message: 'Invalid Trojan address type: 9'
		});
	});

	it('parses a domain target and maps the address type to the VLESS domain type', () => {
		const buffer = buildHeader({ address: 'example.com', port: 8443, payload: [7, 7] });
		expect(processTrojanHeader(buffer, PASSWORD)).toEqual({
			hasError: false,
			addressRemote: 'example.com',
			addressType: 2,
			portRemote: 8443,
			rawDataIndex: buffer.byteLength - 2,
			isUDP: false
		});
	});

	it('parses an IPv4 target', () => {
		const result = processTrojanHeader(buildHeader({ addressType: 1, address: '1.2.3.4' }), PASSWORD);
		expect(result).toMatchObject({ hasError: false, addressRemote: '1.2.3.4', addressType: 1 });
	});

	it('parses an IPv6 target', () => {
		const address = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
		const result = processTrojanHeader(buildHeader({ addressType: 4, address }), PASSWORD);
		expect(result).toMatchObject({
			hasError: false,
			addressRemote: '2001:db8:0:0:0:0:0:1',
			addressType: 4
		});
	});

	it('flags UDP requests', () => {
		const result = processTrojanHeader(buildHeader({ command: 0x03, port: 53 }), PASSWORD);
		expect(result).toMatchObject({ hasError: false, isUDP: true, portRemote: 53 });
	});

	it('rejects truncated addresses', () => {
		expect(processTrojanHeader(buildHeader({ addressType: 1, address: '1.2.3.4', truncateAt: 62 }), PASSWORD))
			.toEqual({ hasError: true, message: 'Invalid Trojan header: IPv4 address truncated' });
		expect(processTrojanHeader(buildHeader({ address: 'example.com', truncateAt: 65 }), PASSWORD))
			.toEqual({ hasError: true, message: 'Invalid Trojan header: domain name truncated' });
		const ipv6 = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
		expect(processTrojanHeader(buildHeader({ addressType: 4, address: ipv6, truncateAt: 70 }), PASSWORD))
			.toEqual({ hasError: true, message: 'Invalid Trojan header: IPv6 address truncated' });
	});

	it('rejects an invalid final CRLF', () => {
		expect(processTrojanHeader(buildHeader({ finalCrlf: [0x00, 0x00] }), PASSWORD)).toEqual({
			hasError: true,
			message: 'Invalid Trojan header: invalid final CRLF'
		});
	});

	it('rejects an empty domain', () => {
		expect(processTrojanHeader(buildHeader({ address: '' }), PASSWORD)).toEqual({
			hasError: true,
			message: 'Address value is empty, address type is 3'
		});
	});
});
