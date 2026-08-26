/**
 * SOCKS5 proxy implementation
 */

/**
 * Reads a response from the SOCKS server, failing loudly on short or absent data.
 * @param {ReadableStreamDefaultReader} reader - Socket reader
 * @param {number} minLength - Minimum number of bytes expected
 * @param {string} stage - Handshake stage name used in error messages
 * @returns {Promise<Uint8Array>} Response bytes
 * @throws {Error} If the server closed the connection or sent too few bytes
 */
async function readResponse(reader, minLength, stage) {
	const chunks = [];
	let length = 0;
	while (length < minLength) {
		const { done, value } = await reader.read();
		if (done || !value) {
			throw new Error(`socks server closed connection while reading ${stage}`);
		}
		chunks.push(value);
		length += value.length;
	}

	if (chunks.length === 1) {
		return chunks[0];
	}

	const response = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		response.set(chunk, offset);
		offset += chunk.length;
	}
	return response;
}

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
		log(`socks5 writer cleanup error: ${closeError.message}`);
	}
	try {
		reader.releaseLock();
	} catch (closeError) {
		log(`socks5 reader cleanup error: ${closeError.message}`);
	}
	try {
		await socket.close();
	} catch (closeError) {
		log(`socks5 socket cleanup error: ${closeError.message}`);
	}
}

/**
 * Establishes SOCKS5 proxy connection.
 * Implements full SOCKS5 handshake including optional authentication.
 * @param {number} addressType - Type of address (1=IPv4, 2=Domain, 3=IPv6)
 * @param {string} addressRemote - Remote address to connect to
 * @param {number} portRemote - Remote port to connect to
 * @param {Function} log - Logging function
 * @param {{username?: string, password?: string, hostname: string, port: number}} parsedSocks5Addr - Parsed SOCKS5 address information
 * @param {Function} connect - Cloudflare socket connect function
 * @returns {Promise<import("@cloudflare/workers-types").Socket>} Connected socket
 * @throws {Error} If the SOCKS5 handshake fails
 */
export async function socks5Connect(addressType, addressRemote, portRemote, log, parsedSocks5Addr, connect) {
	const { username, password, hostname, port } = parsedSocks5Addr;

	// Connect to the SOCKS server
	const socket = connect({
		hostname,
		port,
	});

	// Request head format (Worker -> Socks Server):
	// +----+----------+----------+
	// |VER | NMETHODS | METHODS  |
	// +----+----------+----------+
	// | 1  |    1     | 1 to 255 |
	// +----+----------+----------+

	// https://en.wikipedia.org/wiki/SOCKS#SOCKS5
	// For METHODS:
	// 0x00 NO AUTHENTICATION REQUIRED
	// 0x02 USERNAME/PASSWORD https://datatracker.ietf.org/doc/html/rfc1929
	const socksGreeting = new Uint8Array([5, 2, 0, 2]);

	const writer = socket.writable.getWriter();
	const reader = socket.readable.getReader();
	const encoder = new TextEncoder();

	try {
		await writer.write(socksGreeting);
		log('sent socks greeting');

		let res = await readResponse(reader, 2, 'greeting response');
		// Response format (Socks Server -> Worker):
		// +----+--------+
		// |VER | METHOD |
		// +----+--------+
		// | 1  |   1    |
		// +----+--------+
		if (res[0] !== 0x05) {
			throw new Error(`socks server version error: ${res[0]} expected: 5`);
		}
		if (res[1] === 0xff) {
			throw new Error('socks server offered no acceptable authentication methods');
		}

		// if return 0x0502
		if (res[1] === 0x02) {
			log("socks server needs auth");
			if (!username || !password) {
				throw new Error('socks server requires username/password but none were configured');
			}
			// +----+------+----------+------+----------+
			// |VER | ULEN |  UNAME   | PLEN |  PASSWD  |
			// +----+------+----------+------+----------+
			// | 1  |  1   | 1 to 255 |  1   | 1 to 255 |
			// +----+------+----------+------+----------+
			const authRequest = new Uint8Array([
				1,
				username.length,
				...encoder.encode(username),
				password.length,
				...encoder.encode(password)
			]);
			await writer.write(authRequest);
			res = await readResponse(reader, 2, 'auth response');
			// expected 0x0100
			if (res[0] !== 0x01 || res[1] !== 0x00) {
				throw new Error('failed to authenticate with socks server');
			}
		}

		// Request data format (Worker -> Socks Server):
		// +----+-----+-------+------+----------+----------+
		// |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
		// +----+-----+-------+------+----------+----------+
		// | 1  |  1  | X'00' |  1   | Variable |    2     |
		// +----+-----+-------+------+----------+----------+
		// ATYP: address type of following address
		// 0x01: IPv4 address
		// 0x03: Domain name
		// 0x04: IPv6 address
		// DST.ADDR: desired destination address
		// DST.PORT: desired destination port in network octet order

		// addressType
		// 1--> ipv4  addressLength =4
		// 2--> domain name
		// 3--> ipv6  addressLength =16
		let DSTADDR;	// DSTADDR = ATYP + DST.ADDR
		switch (addressType) {
			case 1:
				DSTADDR = new Uint8Array(
					[1, ...addressRemote.split('.').map(Number)]
				);
				break;
			case 2:
				DSTADDR = new Uint8Array(
					[3, addressRemote.length, ...encoder.encode(addressRemote)]
				);
				break;
			case 3:
				DSTADDR = new Uint8Array(
					[4, ...addressRemote.split(':').flatMap(x => [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2), 16)])]
				);
				break;
			default:
				throw new Error(`invalid addressType is ${addressType}`);
		}
		const socksRequest = new Uint8Array([5, 1, 0, ...DSTADDR, portRemote >> 8, portRemote & 0xff]);
		await writer.write(socksRequest);
		log('sent socks request');

		res = await readResponse(reader, 2, 'connect response');
		// Response format (Socks Server -> Worker):
		//  +----+-----+-------+------+----------+----------+
		// |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
		// +----+-----+-------+------+----------+----------+
		// | 1  |  1  | X'00' |  1   | Variable |    2     |
		// +----+-----+-------+------+----------+----------+
		if (res[1] !== 0x00) {
			throw new Error(`failed to open socks connection, reply code: ${res[1]}`);
		}
		log("socks connection opened");

		writer.releaseLock();
		reader.releaseLock();
		return socket;
	} catch (error) {
		log(`socks5 handshake failed: ${error.message}`);
		await releaseAndClose(socket, writer, reader, log);
		throw error;
	}
}
