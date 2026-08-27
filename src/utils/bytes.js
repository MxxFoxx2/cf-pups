/**
 * Byte array utilities
 */

/**
 * Concatenates Uint8Arrays into a single array.
 * @param {...Uint8Array} arrays - Arrays to concatenate
 * @returns {Uint8Array} Combined array
 */
export function concatUint8Array(...arrays) {
	const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const arr of arrays) {
		result.set(arr, offset);
		offset += arr.length;
	}
	return result;
}

/**
 * Coerces arbitrary binary data into a Uint8Array without copying when possible.
 * @param {ArrayBuffer|Uint8Array|ArrayBufferView|null|undefined} data - Binary data
 * @returns {Uint8Array} View over the data
 */
export function toUint8Array(data) {
	if (data instanceof Uint8Array) {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	if (data && data.buffer instanceof ArrayBuffer) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	return new Uint8Array(data || 0);
}
