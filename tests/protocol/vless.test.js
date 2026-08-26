import { describe, expect, it } from 'vitest';
import { processProtocolHeader } from '../../src/protocol/vless.js';

const USER_ID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';

const uuidBytes = (uuid) => uuid.replace(/-/g, '').match(/.{2}/g).map((byte) => parseInt(byte, 16));

/**
 * Builds a VLESS request header:
 * version | uuid(16) | optLength | opts | command | port(2) | addrType | address | payload
 */
function buildHeader({
	version = 0,
	uuid = USER_ID,
	opts = [],
	command = 1,
	port = 443,
	addressType = 2,
	address = 'example.com',
	payload = []
} = {}) {
	const bytes = [version, ...uuidBytes(uuid), opts.length, ...opts, command, port >> 8, port & 0xff, addressType];

	if (addressType === 1) {
		bytes.push(...address.split('.').map(Number));
	} else if (addressType === 2) {
		const encoded = Array.from(new TextEncoder().encode(address));
		bytes.push(encoded.length, ...encoded);
	} else if (addressType === 3) {
		bytes.push(...address);
	} else {
		bytes.push(...address);
	}

	bytes.push(...payload);
	return new Uint8Array(bytes).buffer;
}

describe('processProtocolHeader', () => {
	it('rejects buffers shorter than 24 bytes', () => {
		expect(processProtocolHeader(new ArrayBuffer(23), USER_ID)).toEqual({
			hasError: true,
			message: 'invalid data'
		});
	});

	it('rejects an unknown user', () => {
		const buffer = buildHeader({ uuid: '00000000-0000-4000-8000-000000000000' });
		expect(processProtocolHeader(buffer, USER_ID)).toEqual({ hasError: true, message: 'invalid user' });
	});

	it('accepts any UUID from a comma separated list', () => {
		const buffer = buildHeader();
		const result = processProtocolHeader(buffer, `00000000-0000-4000-8000-000000000000, ${USER_ID}`);
		expect(result.hasError).toBe(false);
	});

	it('parses a TCP request to a domain', () => {
		const buffer = buildHeader({ address: 'example.com', port: 8443, payload: [1, 2, 3] });
		const result = processProtocolHeader(buffer, USER_ID);
		expect(result).toEqual({
			hasError: false,
			addressRemote: 'example.com',
			addressType: 2,
			portRemote: 8443,
			rawDataIndex: buffer.byteLength - 3,
			protocolVersion: new Uint8Array([0]),
			isUDP: false
		});
	});

	it('parses an IPv4 address', () => {
		const result = processProtocolHeader(buildHeader({ addressType: 1, address: '1.2.3.4' }), USER_ID);
		expect(result).toMatchObject({ hasError: false, addressRemote: '1.2.3.4', addressType: 1 });
	});

	it('parses an IPv6 address', () => {
		const address = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
		const result = processProtocolHeader(buildHeader({ addressType: 3, address }), USER_ID);
		expect(result).toMatchObject({
			hasError: false,
			addressRemote: '2001:db8:0:0:0:0:0:1',
			addressType: 3
		});
	});

	it('flags UDP requests', () => {
		const result = processProtocolHeader(buildHeader({ command: 2, port: 53 }), USER_ID);
		expect(result).toMatchObject({ hasError: false, isUDP: true, portRemote: 53 });
	});

	it('skips the optional addon block when computing offsets', () => {
		const result = processProtocolHeader(buildHeader({ opts: [9, 9, 9], address: 'a.example.com' }), USER_ID);
		expect(result).toMatchObject({ hasError: false, addressRemote: 'a.example.com' });
	});

	it('rejects unsupported commands', () => {
		expect(processProtocolHeader(buildHeader({ command: 3 }), USER_ID)).toEqual({
			hasError: true,
			message: 'command 3 is not supported, command 01-tcp,02-udp,03-mux'
		});
	});

	it('rejects unknown address types', () => {
		expect(processProtocolHeader(buildHeader({ addressType: 7, address: [1, 2] }), USER_ID)).toEqual({
			hasError: true,
			message: 'invalid addressType: 7'
		});
	});

	it('rejects an empty domain address', () => {
		expect(processProtocolHeader(buildHeader({ address: '', payload: [0, 0, 0, 0] }), USER_ID)).toEqual({
			hasError: true,
			message: 'addressValue is empty, addressType is 2'
		});
	});

	it('propagates the protocol version byte', () => {
		const result = processProtocolHeader(buildHeader({ version: 1 }), USER_ID);
		expect(result.protocolVersion).toEqual(new Uint8Array([1]));
	});
});
