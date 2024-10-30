import type { IP } from '@hownetworks/ipv46'
import dns from 'dns'
import { type Packet, PacketReader, PacketWriter } from 'unborn-mcproto'
import { promisify } from 'util'

// 将 dns.resolveSrv 转换为 promise 形式
const resolveSrv = promisify(dns.resolveSrv)

// 默认的 Minecraft 端口
const DEFAULT_MINECRAFT_PORT = 25565

/**
 * 解析 Minecraft SRV 记录
 * @param domain Minecraft 服务器的域名
 * @returns 解析后的主机名和端口号
 */
export const resolveMinecraftSrv = async (
	domain: string
): Promise<{ host: string; port: number }> => {
	if (domain.includes(':'))
		return { host: domain.split(':')[0], port: parseInt(domain.split(':')[1]) }

	const srvRecord = `_minecraft._tcp.${domain}`

	try {
		// 解析 SRV 记录
		const records = await resolveSrv(srvRecord)

		// 如果有 SRV 记录，则返回解析后的主机名和端口号
		if (records.length > 0) {
			const { name: host, port } = records[0]
			return { host, port }
		}
	} catch (error: any) {
		// 如果没有找到 SRV 记录，或者解析失败，则返回默认端口
		if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND') {
			console.error(`Failed to resolve SRV record: ${error.message}`)
		}
	}

	// 如果没有 SRV 记录，返回原始域名和默认端口
	return { host: domain, port: DEFAULT_MINECRAFT_PORT }
}
export const colorHash = (id: number) => {
	// ANSI escape codes for some colors
	const colors = [
		'\x1b[31m', // red
		'\x1b[32m', // green
		'\x1b[33m', // yellow
		'\x1b[34m', // blue
		'\x1b[35m', // magenta
		'\x1b[36m', // cyan
		'\x1b[37m', // white
	]
	const hash = id % colors.length
	const color = colors[hash]
	return `${color}#${id}\x1b[0m`
}

export const packetToHex = (packet: Packet, maxLength = 64) => {
	const buffer =
		packet instanceof PacketReader
			? packet.buffer
			: packet instanceof PacketWriter
			? packet.buffer.subarray(0, packet.offset)
			: packet
	const slicedBuffer =
		buffer.byteLength > maxLength ? buffer.subarray(0, maxLength) : buffer
	const hexString = Array.from(new Uint8Array(slicedBuffer))
		.map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
		.join(' ')

	if (buffer.byteLength > maxLength) {
		const omittedBytes = buffer.byteLength - maxLength
		return `${hexString} ...(Omitted ${omittedBytes} bytes)`
	}

	return hexString
}
