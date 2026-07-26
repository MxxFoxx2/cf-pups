import { UUID } from '../config.js';

/**
 * 格式化 UUID 字节数组为字符串
 */
function formatUUID(bytes) {
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 解析 VLESS 协议头
 */
export function parseVLESSHeader(buffer) {
    if (buffer.byteLength < 24) {
        return { hasError: true, message: '无效的头部长度' };
    }
    const view = new DataView(buffer);
    const version = new Uint8Array(buffer.slice(0, 1));
    const uuid = formatUUID(new Uint8Array(buffer.slice(1, 17)));
    if (uuid !== UUID) {
        return { hasError: true, message: '无效的用户' };
    }
    const optionsLength = view.getUint8(17);
    const command = view.getUint8(18 + optionsLength);
    let isUDP = false;
    if (command === 1) {
        // TCP
    } else if (command === 2) {
        isUDP = true;
    } else {
        return { hasError: true, message: '不支持的命令，仅支持TCP(01)和UDP(02)' };
    }
    let offset = 19 + optionsLength;
    const port = view.getUint16(offset);
    offset += 2;
    const addressType = view.getUint8(offset++);
    let address = '';
    switch (addressType) {
        case 1: // IPv4
            address = Array.from(new Uint8Array(buffer.slice(offset, offset + 4))).join('.');
            offset += 4;
            break;
        case 2: // 域名
            const domainLength = view.getUint8(offset++);
            address = new TextDecoder().decode(buffer.slice(offset, offset + domainLength));
            offset += domainLength;
            break;
        case 3: // IPv6
            const ipv6 = [];
            for (let i = 0; i < 8; i++) {
                ipv6.push(view.getUint16(offset).toString(16).padStart(4, '0'));
                offset += 2;
            }
            address = ipv6.join(':').replace(/(^|:)0+(\w)/g, '$1$2');
            break;
        default:
            return { hasError: true, message: '不支持的地址类型' };
    }
    return {
        hasError: false,
        addressRemote: address,
        portRemote: port,
        rawDataIndex: offset,
        vlessVersion: version,
        isUDP,
        addressType
    };
}
