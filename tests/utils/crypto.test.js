import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { hashTrojanPassword, sha224 } from '../../src/utils/crypto.js';

const nodeSha224 = (str) => createHash('sha224').update(str, 'binary').digest('hex');

describe('sha224', () => {
	it('matches known digests', () => {
		expect(sha224('')).toBe('d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f');
		expect(sha224('abc')).toBe('23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
	});

	it('returns a 56-character hex string', () => {
		const digest = sha224('password');
		expect(digest).toHaveLength(56);
		expect(digest).toMatch(/^[0-9a-f]{56}$/);
	});

	it('matches node crypto for inputs spanning multiple block sizes', () => {
		for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 200]) {
			const input = 'a'.repeat(length);
			expect(sha224(input)).toBe(nodeSha224(input));
		}
	});

	it('is deterministic and sensitive to small changes', () => {
		expect(sha224('trojan-secret')).toBe(sha224('trojan-secret'));
		expect(sha224('trojan-secret')).not.toBe(sha224('trojan-secreT'));
	});

	it('returns undefined for non-ASCII input', () => {
		expect(sha224('пароль')).toBeUndefined();
	});
});

describe('hashTrojanPassword', () => {
	it('delegates to sha224', () => {
		expect(hashTrojanPassword('password')).toBe(sha224('password'));
	});
});
