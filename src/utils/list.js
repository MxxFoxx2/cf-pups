/**
 * Comma-separated list utilities
 */

/**
 * Normalizes a comma-separated string (or array) into a trimmed, non-empty array.
 * @param {string|string[]|null|undefined} value - Value to parse
 * @param {string[]} [fallback=[]] - Value returned when nothing is provided
 * @returns {string[]} Parsed values
 */
export function parseList(value, fallback = []) {
	if (!value) {
		return fallback;
	}
	const list = (Array.isArray(value) ? value : value.split(','))
		.map(entry => entry.trim())
		.filter(Boolean);
	return list.length > 0 ? list : fallback;
}
