/**
 * Address utilities shared by protocol parsers, generators and resolvers
 */

/**
 * Address kinds used by protocol headers
 */
export const ADDRESS_KIND_IPV4 = 'ipv4';
export const ADDRESS_KIND_DOMAIN = 'domain';
export const ADDRESS_KIND_IPV6 = 'ipv6';

/**
 * Reads an address from a protocol header buffer.
 * For domains, `offset` points at the length byte preceding the domain bytes.
 * @param {Uint8Array} bytes - Header bytes
 * @param {DataView} dataView - View over the same buffer
 * @param {string} kind - Address kind (ipv4, domain, ipv6)
 * @param {number} offset - Index of the address field
 * @returns {{address: string, length: number, valueIndex: number}} Parsed address
 * @throws {Error} If the address kind is unknown
 */
export function readAddress(bytes, dataView, kind, offset) {
	switch (kind) {
		case ADDRESS_KIND_IPV4:
			return {
				address: Array.from(bytes.slice(offset, offset + 4)).join('.'),
				length: 4,
				valueIndex: offset
			};
		case ADDRESS_KIND_DOMAIN: {
			const length = bytes[offset];
			const valueIndex = offset + 1;
			return {
				address: new TextDecoder().decode(bytes.slice(valueIndex, valueIndex + length)),
				length,
				valueIndex
			};
		}
		case ADDRESS_KIND_IPV6:
			return {
				address: Array.from({ length: 8 }, (_, i) => dataView.getUint16(offset + i * 2).toString(16)).join(':'),
				length: 16,
				valueIndex: offset
			};
		default:
			throw new Error(`Unknown address kind: ${kind}`);
	}
}

/**
 * Splits an `host:port` string, keeping IPv6 brackets intact.
 * @param {string} address - Address string (`host`, `host:port` or `[ipv6]:port`)
 * @param {string} [defaultPort='443'] - Port used when the address has none
 * @returns {[string, string]} Tuple of [host, port]
 */
export function splitHostPort(address, defaultPort = '443') {
	if (!address) {
		return ['', defaultPort];
	}
	if (address.includes(']:')) {
		const [host, port] = address.split(']:');
		return [`${host}]`, port || defaultPort];
	}
	if (address.startsWith('[')) {
		return [address, defaultPort];
	}
	const colonIndex = address.lastIndexOf(':');
	if (colonIndex === -1) {
		return [address, defaultPort];
	}
	return [address.slice(0, colonIndex), address.slice(colonIndex + 1) || defaultPort];
}

