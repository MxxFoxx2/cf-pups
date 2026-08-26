/**
 * Subscription content generator
 */

import { ed, HttpPort, HttpsPort } from '../config/constants.js';
import { proxyIPs } from '../config/defaults.js';
import { splitHostPort } from '../utils/address.js';
import { parseList } from '../utils/list.js';
import { buildTrojanUrl, buildVlessUrl } from './urls.js';

/**
 * Generates subscription content with VLESS and Trojan URLs.
 * @param {string} userID_path - User ID path (supports comma-separated multiple UUIDs)
 * @param {string} hostname - Host name for configuration
 * @param {string|string[]} proxyIP - Proxy IP address or array of addresses
 * @param {string} trojanPassword - Trojan password (optional, defaults to first userID)
 * @returns {string} Base64 encoded subscription content
 */
export function genSub(userID_path, hostname, proxyIP, trojanPassword = null) {
	// Add all CloudFlare public CNAME domains
	const mainDomains = new Set([
		hostname,
		// public domains
		'icook.hk',
		'japan.com',
		'malaysia.com',
		'russia.com',
		'singapore.com',
		'www.visa.com',
		'www.csgo.com',
		'www.shopify.com',
		'www.whatismyip.com',
		'www.ipget.net',
		// High frequency update sources
		'freeyx.cloudflare88.eu.org',    // 1000ip/3min
		'cloudflare.182682.xyz',         // 15ip/15min
		'cfip.cfcdn.vip',                // 6ip/1day
		...proxyIPs,
		// Manual update and unknown frequency
		'cf.0sm.com',
		'cloudflare-ip.mofashi.ltd',
		'cf.090227.xyz',
		'cf.zhetengsha.eu.org',
		'cloudflare.9jy.cc',
		'cf.zerone-cdn.pp.ua',
		'cfip.1323123.xyz',
		'cdn.tzpro.xyz',
		'cf.877771.xyz',
		'cnamefuckxxs.yuchen.icu',
		'cfip.xxxxxxxx.tk',              // OTC maintained
	]);

	const userIDArray = parseList(userID_path);
	const proxyIPArray = parseList(proxyIP, proxyIPs);
	const randomPath = () => '/' + Math.random().toString(36).substring(2, 15) + '?ed=2048';
	const commonUrlPartHttp = `?encryption=none&security=none&fp=random&type=ws&host=${hostname}&path=${encodeURIComponent(randomPath())}#`;
	const commonUrlPartHttps = `?encryption=none&security=tls&sni=${hostname}&fp=random&type=ws&host=${hostname}&path=%2F%3Fed%3D2048#`;

	const result = userIDArray.flatMap((userID) => {
		let allUrls = [];
		// Generate main HTTP URLs first for all domains (except pages.dev)
		if (!hostname.includes('pages.dev')) {
			mainDomains.forEach(domain => {
				Array.from(HttpPort).forEach((port) => {
					const urlPart = `${hostname.split('.')[0]}-${domain}-HTTP-${port}`;
					allUrls.push(buildVlessUrl(userID, domain, port, commonUrlPartHttp + urlPart));
				});
			});
		}

		// Generate main HTTPS URLs for all domains
		mainDomains.forEach(domain => {
			Array.from(HttpsPort).forEach((port) => {
				const urlPart = `${hostname.split('.')[0]}-${domain}-HTTPS-${port}`;
				allUrls.push(buildVlessUrl(userID, domain, port, commonUrlPartHttps + urlPart));
			});
		});

		// Generate proxy HTTPS URLs
		proxyIPArray.forEach((proxyAddr) => {
			const [proxyHost, proxyPort] = splitHostPort(proxyAddr);
			const urlPart = `${hostname.split('.')[0]}-${proxyHost}-HTTPS-${proxyPort}`;
			allUrls.push(buildVlessUrl(userID, proxyHost, proxyPort, commonUrlPartHttps + urlPart + '-' + atob(ed)));
		});

		return allUrls;
	});

	// Generate Trojan URLs
	const effectiveTrojanPassword = trojanPassword || userIDArray[0];
	const trojanUrls = generateTrojanUrls(effectiveTrojanPassword, hostname, proxyIPArray);

	return btoa([...result, ...trojanUrls].join('\n'));
}

/**
 * Generates Trojan subscription URLs
 * @param {string} password - Trojan password
 * @param {string} hostname - Host name
 * @param {string[]} proxyIPArray - Proxy IP array
 * @returns {string[]} Array of Trojan URLs
 */
function generateTrojanUrls(password, hostname, proxyIPArray) {
	const urls = [];
	const commonParams = `?security=tls&type=ws&host=${hostname}&path=%2F%3Fed%3D2048&sni=${hostname}`;

	// Main hostname Trojan URLs (HTTPS ports only)
	Array.from(HttpsPort).forEach((port) => {
		const urlPart = `${hostname.split('.')[0]}-Trojan-HTTPS-${port}`;
		urls.push(buildTrojanUrl(password, hostname, port, `${commonParams}#${urlPart}`));
	});

	// Proxy IP Trojan URLs
	proxyIPArray.forEach((proxyAddr) => {
		const [proxyHost, proxyPort] = splitHostPort(proxyAddr);
		const urlPart = `${hostname.split('.')[0]}-${proxyHost}-Trojan-${proxyPort}`;
		urls.push(buildTrojanUrl(password, proxyHost, proxyPort, `${commonParams}#${urlPart}`));
	});

	return urls;
}

/**
 * Generates Trojan-only subscription content
 * @param {string} password - Trojan password
 * @param {string} hostname - Host name
 * @param {string|string[]} proxyIP - Proxy IP address or array of addresses
 * @returns {string} Base64 encoded Trojan subscription content
 */
export function genTrojanSub(password, hostname, proxyIP) {
	const proxyIPArray = parseList(proxyIP, proxyIPs);
	const urls = generateTrojanUrls(password, hostname, proxyIPArray);
	return btoa(urls.join('\n'));
}
