import { describe, expect, it } from 'vitest';
import { base64ToArrayBuffer, stringify, unsafeStringify } from '../../src/utils/encoding.js';

describe('base64ToArrayBuffer', () => {
	it('returns nulls for empty input', () => {
		expect(base64ToArrayBuffer('')).toEqual({ earlyData: null, error: null });
		expect(base64ToArrayBuffer(undefined)).toEqual({ earlyData: null, error: null });
	});

	it('decodes standard base64', () => {
		const { earlyData, error } = base64ToArrayBuffer(btoa('hello'));
		expect(error).toBeNull();
		expect(new TextDecoder().decode(earlyData)).toBe('hello');
	});

	it('decodes URL-safe base64 by restoring + and /', () => {
		const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
		const standard = btoa(String.fromCharCode(...bytes));
		const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_');
		expect(urlSafe).not.toBe(standard);

		const { earlyData, error } = base64ToArrayBuffer(urlSafe);
		expect(error).toBeNull();
		expect(Array.from(new Uint8Array(earlyData))).toEqual(Array.from(bytes));
	});

	it('returns the error for invalid base64', () => {
		const { earlyData, error } = base64ToArrayBuffer('!!!not-base64!!!');
		expect(earlyData).toBeNull();
		expect(error).toBeInstanceOf(Error);
	});
});

describe('unsafeStringify', () => {
	const bytes = Uint8Array.from([
		0xd3, 0x42, 0xd1, 0x1e, 0xd4, 0x24, 0x45, 0x83,
		0xb3, 0x6e, 0x52, 0x4a, 0xb1, 0xf0, 0xaf, 0xa4
	]);

	it('formats 16 bytes as a lowercase UUID', () => {
		expect(unsafeStringify(bytes)).toBe('d342d11e-d424-4583-b36e-524ab1f0afa4');
	});

	it('honors the offset', () => {
		const padded = new Uint8Array(19);
		padded.set(bytes, 3);
		expect(unsafeStringify(padded, 3)).toBe('d342d11e-d424-4583-b36e-524ab1f0afa4');
	});

	it('does not validate the produced UUID', () => {
		expect(unsafeStringify(new Uint8Array(16))).toBe('00000000-0000-0000-0000-000000000000');
	});
});

describe('stringify', () => {
	it('returns a valid UUID', () => {
		const bytes = Uint8Array.from([
			0xd3, 0x42, 0xd1, 0x1e, 0xd4, 0x24, 0x45, 0x83,
			0xb3, 0x6e, 0x52, 0x4a, 0xb1, 0xf0, 0xaf, 0xa4
		]);
		expect(stringify(bytes)).toBe('d342d11e-d424-4583-b36e-524ab1f0afa4');
	});

	it('throws for bytes that do not form a valid UUID', () => {
		expect(() => stringify(new Uint8Array(16))).toThrow(TypeError);
	});
});
