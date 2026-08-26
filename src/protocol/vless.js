/**
 * VLESS protocol implementation
 */

import { stringify } from '../utils/encoding.js';
import { ADDRESS_KIND_DOMAIN, ADDRESS_KIND_IPV4, ADDRESS_KIND_IPV6, readAddress } from '../utils/address.js';
import { parseList } from '../utils/list.js';

/**
 * Maps VLESS address type bytes to shared address kinds
 */
const ADDRESS_KINDS = {
	1: ADDRESS_KIND_IPV4,
	2: ADDRESS_KIND_DOMAIN,
	3: ADDRESS_KIND_IPV6
};

/**
 * Processes VLESS protocol header.
 * Extracts and validates protocol information from buffer.
 * @param {ArrayBuffer} protocolBuffer - Buffer containing protocol header
 * @param {string} userID - User ID for validation (supports comma-separated multiple UUIDs)
 * @returns {{
 *   hasError: boolean,
 *   message?: string,
 *   addressRemote?: string,
 *   addressType?: number,
 *   portRemote?: number,
 *   rawDataIndex?: number,
 *   protocolVersion?: Uint8Array,
 *   isUDP?: boolean
 * }} Processed header information
 */
export function processProtocolHeader(protocolBuffer, userID) {
	if (protocolBuffer.byteLength < 24) {
		return { hasError: true, message: 'invalid data' };
	}

	const dataView = new DataView(protocolBuffer);
	const bytes = new Uint8Array(protocolBuffer);
	const version = dataView.getUint8(0);
	const slicedBufferString = stringify(bytes.slice(1, 17));

	const uuids = parseList(userID);
	const isValidUser = uuids.some(uuid => slicedBufferString === uuid);

	console.log(`userID: ${slicedBufferString}`);

	if (!isValidUser) {
		return { hasError: true, message: 'invalid user' };
	}

	const optLength = dataView.getUint8(17);
	const command = dataView.getUint8(18 + optLength);

	if (command !== 1 && command !== 2) {
		return { hasError: true, message: `command ${command} is not supported, command 01-tcp,02-udp,03-mux` };
	}

	const portIndex = 18 + optLength + 1;
	const portRemote = dataView.getUint16(portIndex);
	const addressType = dataView.getUint8(portIndex + 2);
	const addressKind = ADDRESS_KINDS[addressType];

	if (!addressKind) {
		return { hasError: true, message: `invalid addressType: ${addressType}` };
	}

	const {
		address: addressValue,
		length: addressLength,
		valueIndex: addressValueIndex
	} = readAddress(bytes, dataView, addressKind, portIndex + 3);

	if (!addressValue) {
		return { hasError: true, message: `addressValue is empty, addressType is ${addressType}` };
	}

	return {
		hasError: false,
		addressRemote: addressValue,
		addressType,
		portRemote,
		rawDataIndex: addressValueIndex + addressLength,
		protocolVersion: new Uint8Array([version]),
		isUDP: command === 2
	};
}
