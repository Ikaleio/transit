import net from 'net'
import { PacketWriter, buildPacket } from '../src/protocols/minecraft'

// 解析命令行参数
const args = process.argv.slice(2)
let localPort = 3000
let forwardAddr = '127.0.0.1:3001'
let measureLatency = false
let measureBandwidth = false
// 固定发送间隔 10ms，以及最大带宽参数（Byte/s）
// 默认 32MB/s
let maxBandwidth = 32 * 1024 * 1024
let connectionCount = 1

for (let i = 0; i < args.length; i++) {
	if (args[i] === '-l' && args[i + 1]) {
		localPort = parseInt(args[i + 1])
		i++
	} else if (args[i] === '-f' && args[i + 1]) {
		forwardAddr = args[i + 1]
		i++
	} else if (args[i] === '-p') {
		measureLatency = true
	} else if (args[i] === '-b') {
		measureBandwidth = true
		// 如果 -b 后有附加参数，则解析最大带宽
		if (args[i + 1] && !args[i + 1].startsWith('-')) {
			const bwParam = args[i + 1]
			i++
			if (bwParam.toUpperCase().endsWith('K')) {
				// 例如 "-b 80K" -> 最大带宽 80KB/s
				const num = parseInt(bwParam.slice(0, -1))
				maxBandwidth = num * 1024
			} else if (bwParam.toUpperCase().endsWith('M')) {
				const num = parseInt(bwParam.slice(0, -1))
				maxBandwidth = num * 1024 * 1024
			} else {
				// 不带单位，直接解析为字节数
				maxBandwidth = parseInt(bwParam)
			}
		}
	} else if (args[i] === '-n' && args[i + 1]) {
		connectionCount = parseInt(args[i + 1])
		i++
	}
}
// 若均未指定，则默认延迟测量
if (!measureLatency && !measureBandwidth) {
	measureBandwidth = true
}

// 固定发送间隔为 10ms
const bwInterval = 10 // 毫秒
// 根据最大带宽计算带宽包数据部分大小：bwSize = maxBandwidth × (bwInterval/1000)
const bwSize = Math.floor(maxBandwidth * (bwInterval / 1000))

const [forwardHost, forwardPortStr] = forwardAddr.split(':')
const forwardPort = parseInt(forwardPortStr)

// 定义包头与包体大小
const LATENCY_HEADER = 0x01
const BANDWIDTH_HEADER = 0x02
const LATENCY_PACKET_SIZE = 1 + 8 // 9 字节
const BANDWIDTH_PACKET_SIZE = 1 + bwSize // 1字节头 + bwSize字节数据

// 计数变量
let latencyCount = 0
let totalLatency = 0 // 毫秒
let totalBandwidthBytes = 0

// --- 创建本地 echo 服务器 ---
const echoServer = net.createServer(socket => {
	socket.on('data', data => {
		socket.write(data)
	})
	socket.on('error', error => {
		console.error('Echo server error:', error)
	})
})
echoServer.listen(localPort, () => {
	console.log(`Echo server listening on port ${localPort}`)
})

// --- 客户端：连接转发器 ---
for (let i = 0; i < connectionCount; i++) {
	const clientSocket = net.createConnection(
		{ host: forwardHost, port: forwardPort },
		async () => {
			console.log(
				`Connected (${i + 1}/${connectionCount}) to forwarder ${forwardHost}:${forwardPort}`,
			)
			// 发送握手包（packetId=0x0, protocol=47, server=127.0.0.1, port=本地echo端口, nextState=2）
			{
				const handshake = new PacketWriter(0x0)
				handshake.writeVarInt(47)
				handshake.writeString('127.0.0.1')
				handshake.writeUInt16(localPort)
				handshake.writeVarInt(2)
				const handshakeBuffer = await buildPacket(handshake)
				clientSocket.write(handshakeBuffer)
				console.log('Sent handshake packet')
			}
			// 发送登录包（packetId=0x0, username="benchmarkUser"）
			{
				const login = new PacketWriter(0x0)
				login.writeString('benchmarkUser')
				const loginBuffer = await buildPacket(login)
				clientSocket.write(loginBuffer)
				console.log('Sent login packet')
			}
			// 初始化自定义数据缓存
			;(clientSocket as any).buffer = Buffer.alloc(0)

			// 根据测量模式启动定时发送任务
			if (measureLatency) {
				// 每秒发送一次延迟测量包
				setInterval(() => {
					const buf = Buffer.alloc(LATENCY_PACKET_SIZE)
					buf.writeUInt8(LATENCY_HEADER, 0)
					buf.writeBigInt64LE(BigInt(Date.now()), 1)
					clientSocket.write(buf)
				}, 1000)
			}
			if (measureBandwidth) {
				// 每 bwInterval 毫秒发送一次带宽测量包
				const bandwidthPayload = Buffer.alloc(BANDWIDTH_PACKET_SIZE, 0) // 用 0 填充
				bandwidthPayload.writeUInt8(BANDWIDTH_HEADER, 0)
				setInterval(() => {
					clientSocket.write(bandwidthPayload)
				}, bwInterval)
			}
		},
	)

	clientSocket.on('data', (data: Buffer) => {
		;(clientSocket as any).buffer = Buffer.concat([
			(clientSocket as any).buffer,
			data,
		])
		// 处理自定义协议包
		while ((clientSocket as any).buffer.length >= 1) {
			const header = (clientSocket as any).buffer.readUInt8(0)
			if (header === LATENCY_HEADER) {
				if ((clientSocket as any).buffer.length < LATENCY_PACKET_SIZE) break
				const packet = (clientSocket as any).buffer.subarray(
					0,
					LATENCY_PACKET_SIZE,
				)
				;(clientSocket as any).buffer = (clientSocket as any).buffer.subarray(
					LATENCY_PACKET_SIZE,
				)
				const sentTime = Number(packet.readBigInt64LE(1))
				const delay = Date.now() - sentTime
				latencyCount++
				totalLatency += delay
			} else if (header === BANDWIDTH_HEADER) {
				if ((clientSocket as any).buffer.length < BANDWIDTH_PACKET_SIZE) break
				// 带宽包，不做延迟计算，只计数
				totalBandwidthBytes += BANDWIDTH_PACKET_SIZE
				;(clientSocket as any).buffer = (clientSocket as any).buffer.subarray(
					BANDWIDTH_PACKET_SIZE,
				)
			} else {
				// 未知包，丢弃 1 字节后继续
				;(clientSocket as any).buffer = (clientSocket as any).buffer.subarray(1)
			}
		}
	})

	clientSocket.on('error', err => console.error('Client socket error:', err))

	await Bun.sleep(100)
}

// 每秒打印统计数据
setInterval(() => {
	if (measureLatency) {
		const avgLatency = latencyCount
			? (totalLatency / latencyCount).toFixed(2)
			: '0'
		console.log(`Latency: Avg ${avgLatency} ms (n=${latencyCount})`)
		latencyCount = 0
		totalLatency = 0
	}
	if (measureBandwidth) {
		// 自动转换带宽单位
		const formatBandwidth = (bytes: number): string => {
			const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
			let value = bytes
			let unitIndex = 0
			while (value >= 1024 && unitIndex < units.length - 1) {
				value /= 1024
				unitIndex++
			}
			return `${value.toFixed(2)} ${units[unitIndex]}`
		}
		console.log(`Bandwidth: ${formatBandwidth(totalBandwidthBytes)}`)
		totalBandwidthBytes = 0
	}
}, 1000)
