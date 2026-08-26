/**
 * Shared protocol URL builders for config page and subscription output
 */

import { at, pt, trojanPt } from '../config/constants.js';

/**
 * Builds a VLESS share URL.
 * @param {string} userID - User ID
 * @param {string} host - Server host
 * @param {string|number} port - Server port
 * @param {string} query - Query string (and fragment) appended to the URL
 * @returns {string} VLESS URL
 */
export function buildVlessUrl(userID, host, port, query) {
	return `${atob(pt)}://${userID}${atob(at)}${host}:${port}${query}`;
}

/**
 * Builds a Trojan share URL.
 * @param {string} password - Trojan password (URL encoded by this function)
 * @param {string} host - Server host
 * @param {string|number} port - Server port
 * @param {string} query - Query string (and fragment) appended to the URL
 * @returns {string} Trojan URL
 */
export function buildTrojanUrl(password, host, port, query) {
	return `${atob(trojanPt)}://${encodeURIComponent(password)}${atob(at)}${host}:${port}${query}`;
}
