/**
 * HTTP CONNECT proxy implementation
 */

/**
 * Releases stream locks and closes a socket after a failed handshake.
 * Cleanup failures are logged rather than propagated so the original error survives.
 * @param {import("@cloudflare/workers-types").Socket} socket - Socket to close
 * @param {WritableStreamDefaultWriter} writer - Writer to release
 * @param {ReadableStreamDefaultReader} reader - Reader to release
 * @param {Function} log - Logging function
 * @returns {Promise<void>}
 */
async function releaseAndClose(socket, writer, reader, log) {
	try {
		writer.releaseLock();
	} catch (closeError) {
		log(`HTTP CONNECT writer cleanup error: ${closeError.message}`);
	}
	try {
		reader.releaseLock();
	} catch (closeError) {
		log(`HTTP CONNECT reader cleanup error: ${closeError.message}`);
	}
	try {
		await socket.close();
	} catch (closeError) {
		log(`HTTP CONNECT socket cleanup error: ${closeError.message}`);
	}
}

/**
 * Establishes HTTP CONNECT tunnel proxy connection.
 * @param {number} addressType - Type of address (1=IPv4, 2=Domain, 3=IPv6)
 * @param {string} addressRemote - Remote address to connect to
 * @param {number} portRemote - Remote port to connect to
 * @param {Function} log - Logging function
 * @param {{username?: string, password?: string, hostname: string, port: number}} parsedHttpAddr - Parsed HTTP proxy address
 * @param {Function} connect - Cloudflare socket connect function
 * @param {Uint8Array} [initialData] - Initial data to send after connection established
 * @returns {Promise<import("@cloudflare/workers-types").Socket>} Connected socket
 * @throws {Error} If the CONNECT tunnel cannot be established
 */
export async function httpConnect(addressType, addressRemote, portRemote, log, parsedHttpAddr, connect, initialData = new Uint8Array(0)) {
	const { username, password, hostname, port } = parsedHttpAddr;

	// Connect to HTTP proxy server
	const socket = connect({ hostname, port });
	const writer = socket.writable.getWriter();
	const reader = socket.readable.getReader();

	try {
		// Build CONNECT request
		const auth = username && password ? `Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}\r\n` : '';
		const request = `CONNECT ${addressRemote}:${portRemote} HTTP/1.1\r\nHost: ${addressRemote}:${portRemote}\r\n${auth}User-Agent: Mozilla/5.0\r\nConnection: keep-alive\r\n\r\n`;

		await writer.write(new TextEncoder().encode(request));
		log('sent HTTP CONNECT request');

		// Read HTTP response header (until \r\n\r\n)
		let responseBuffer = new Uint8Array(0);
		let headerEndIndex = -1;
		let bytesRead = 0;

		while (headerEndIndex === -1 && bytesRead < 8192) {
			const { done, value } = await reader.read();
			if (done) {
				throw new Error('Connection closed before receiving HTTP response');
			}
			responseBuffer = new Uint8Array([...responseBuffer, ...value]);
			bytesRead = responseBuffer.length;

			// Find \r\n\r\n (0x0d 0x0a 0x0d 0x0a)
			const crlfcrlf = responseBuffer.findIndex((_, i) =>
				i < responseBuffer.length - 3 &&
				responseBuffer[i] === 0x0d &&
				responseBuffer[i + 1] === 0x0a &&
				responseBuffer[i + 2] === 0x0d &&
				responseBuffer[i + 3] === 0x0a
			);
			if (crlfcrlf !== -1) {
				headerEndIndex = crlfcrlf + 4;
			}
		}

		if (headerEndIndex === -1) {
			throw new Error('Invalid HTTP response: header too large or malformed');
		}

		// Parse status code from response
		const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));
		const statusMatch = headerText.split('\r\n')[0].match(/HTTP\/\d\.\d\s+(\d+)/);
		if (!statusMatch) {
			throw new Error('Invalid HTTP response format');
		}

		const statusCode = parseInt(statusMatch[1]);
		log(`HTTP proxy response: ${headerText.split('\r\n')[0]}`);

		if (statusCode < 200 || statusCode >= 300) {
			throw new Error(`HTTP CONNECT failed: HTTP ${statusCode}`);
		}

		log('HTTP CONNECT tunnel established');

		// Send initial data if provided
		if (initialData.length > 0) {
			await writer.write(initialData);
		}

		writer.releaseLock();
		reader.releaseLock();
		return socket;
	} catch (error) {
		log(`HTTP CONNECT error: ${error.message}`);
		await releaseAndClose(socket, writer, reader, log);
		throw error;
	}
}
