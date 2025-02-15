import { type Packet, PacketWriter, PacketReader } from 'unborn-mcproto'
import * as zlib from 'zlib'

const encodeVarInt = (value: number) => {
	const SEGMENT_BITS = 0x7f
	const CONTINUE_BIT = 0x80
	let bytes = []
	while (true) {
		if ((value & ~SEGMENT_BITS) === 0) {
			bytes.push(value)
			break
		}
		bytes.push((value & SEGMENT_BITS) | CONTINUE_BIT)
		value >>>= 7
	}
	return Buffer.from(bytes)
}

const decodeVarInt = (buffer: Buffer, offset: number): [number, number] => {
	const SEGMENT_BITS = 0x7f
	const CONTINUE_BIT = 0x80
	let value = 0
	let position = 0
	let currentByte
	while (true) {
		currentByte = buffer[offset++]
		value |= (currentByte & SEGMENT_BITS) << position
		if ((currentByte & CONTINUE_BIT) === 0) break
		position += 7
		if (position >= 32) throw new Error('VarInt is too big')
	}
	return [value, offset]
}

// 构造 Minecraft 数据包（数据压缩 + 添加长度字段）
export const buildPacket = async (
	packet: Packet | PacketWriter | PacketReader,
	compressionThreshold = -1,
): Promise<Buffer> => {
	const buffer =
		packet instanceof PacketReader
			? packet.buffer
			: packet instanceof PacketWriter
				? packet.buffer.subarray(0, packet.offset)
				: packet

	if (compressionThreshold <= 0) {
		// No compression
		return Buffer.concat([
			encodeVarInt(buffer.byteLength), // Packet length
			buffer, // Packet data
		])
	} else {
		if (buffer.byteLength >= compressionThreshold) {
			// Compress the packet
			const compressed = await new Promise<Buffer>((resolve, reject) => {
				zlib.deflate(buffer, (err, result) => {
					if (err) reject(err)
					else resolve(result)
				})
			})
			const uncompressedLength = buffer.byteLength

			return Buffer.concat([
				encodeVarInt(
					compressed.byteLength + encodeVarInt(uncompressedLength).length,
				), // Total length
				encodeVarInt(uncompressedLength), // Uncompressed length
				compressed, // Compressed data
			])
		} else {
			// No compression, but compression is enabled
			return Buffer.concat([
				encodeVarInt(buffer.byteLength + 1), // Total length (1 byte for uncompressed length)
				Buffer.from([0]), // Uncompressed length is 0 to indicate no compression
				buffer, // Uncompressed data
			])
		}
	}
}

// 流式解码 Minecraft 数据包
export class MinecraftPacketStream {
	private buffer = Buffer.alloc(0)
	private compressionThreshold = -1
	private queue: Buffer[] = [] // 队列存储已解析的包
	private packetPromiseResolver: (() => void) | null = null // 用于异步等待包

	// TODO: 用 Result API 实现异常处理
	async push(chunk: Buffer): Promise<boolean> {
		this.buffer = Buffer.concat([this.buffer, chunk])

		// 如果 buffer 的大小超过了 2^21 - 1 Bytes（一个 Minecraft 数据包的最大长度）
		if (this.buffer.length > 2097151) return false
		else {
			// 如果 buffer 的大小未达到 2^21 - 1 Bytes，正常处理 buffer
			try {
				this.processBuffer()
			} catch {
				return false
			}
		}
		return true
	}

	setCompressionThreshold(threshold: number) {
		this.compressionThreshold = threshold
	}

	// 需要考虑到黏包和半包的情况，因此需要在解码时进行缓存
	private processBuffer() {
		let offset = 0
		let length: number

		while (true) {
			try {
				;[length, offset] = decodeVarInt(this.buffer, offset)
			} catch (err) {
				break // 推断为不完整的数据包，等待更多数据
			}

			if (offset + length > this.buffer.length) {
				break // 推断为不完整的数据包，等待更多数据
			}

			if (this.compressionThreshold == -1) {
				const packet = this.buffer.subarray(offset, offset + length)
				this.queue.push(packet) // 将包推送到队列
			} else {
				const [len, off] = decodeVarInt(this.buffer, offset)
				const buffer = this.buffer.subarray(off, offset + length)

				if (len == 0) {
					this.queue.push(buffer) // 将包推送到队列
				} else {
					zlib.inflate(
						buffer,
						{ finishFlush: zlib.constants.Z_SYNC_FLUSH },
						(error, decompressed) => {
							if (error) {
								throw error
							} else {
								this.queue.push(decompressed) // 将解压后的包推送到队列
							}
						},
					)
				}
			}
			// 如果有等待的 Promise，则 resolve 它
			if (this.packetPromiseResolver) {
				this.packetPromiseResolver()
				this.packetPromiseResolver = null
			}

			offset += length
		}

		this.buffer = this.buffer.subarray(offset)
	}

	// 检查是否有可用的包
	havePacket(): boolean {
		return this.queue.length > 0
	}

	// 获取下一个包
	async nextPacket(): Promise<PacketReader> {
		// 如果队列中有包，直接返回
		if (this.queue.length > 0) {
			const packet = this.queue.shift()!
			return new PacketReader(packet)
		}
		// 如果没有包，等待直到有包
		await new Promise<void>(resolve => {
			this.packetPromiseResolver = resolve
		})
		// 返回队列中的下一个包
		return new PacketReader(this.queue.shift()!)
	}
}

export { PacketWriter }
