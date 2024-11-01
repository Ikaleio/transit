import Bun from 'bun'
import { IP } from '@hownetworks/ipv46'
import { PacketReader, PacketWriter, State } from 'unborn-mcproto'
import { colorHash, packetToHex } from './utils'
import { z } from 'zod'
import { type ConfigSchema } from './config'
import {
	IPv4ProxyAddress,
	IPv6ProxyAddress,
	IPv4Address,
	IPv6Address,
	V2ProxyProtocol,
	Command,
	TransportProtocol,
} from 'proxy-protocol-js'
import { buildMotd, MotdSchema } from './motd'
import { MinecraftPacketStream, buildPacket } from './protocols/minecraft'
import { ProxyProtocolPacketStream } from './protocols/proxy'
import { LoginResultType } from './plugins'

/*
	Minecraft 协议文档 https://wiki.vg/Protocol
	
	由于 S2C Encryption Request 后的数据包都是加密的，且正版登录时无法进行中间人攻击，因此只能在握手和登录阶段进行解包
*/

// Client to relay socket data
export type C2RSocketData = {
	connId: number // 连接 ID，连接建立时随机分配，用于日志
	sendBuffer: Buffer | null // 发送缓冲区
	ppStream: ProxyProtocolPacketStream // Proxy Protocol v2 解包流
	C2RStream: MinecraftPacketStream // 用于解包握手和登录包
	remote: Bun.Socket<R2SSocketData> | null // 远程服务器连接
	protocol: number // Minecraft 协议版本
	state: State | null // Minecraft 协议状态 (Handshake | Status | Login | Play)
	host: string | null // Minecraft 握手包中的服务器地址
	remoteHost: string | null // 目标服务器地址
	remotePort: number | null // 目标服务器端口
	username: string | null // Minecraft 登录包中的用户名
	realRemoteHost: string | null // 实际握手包发送的服务器地址
	originIP: IP | null // 客户端 IP 地址（若开启 ProxyProtocol 入站，从其中解析）
	proxyProtocol: boolean | null // 是否启用 Proxy Protocol v2 出站
	FML: 0 | 1 | 2 | null // 是否为 Forge Mod Loader (2) 客户端，0 代表非 FML
}

// Relay to server socket data
type R2SSocketData = {
	client: Bun.Socket<C2RSocketData> | null // 客户端连接
	sendBuffer: Buffer | null // 发送缓冲区
}

const writeToBuffer = (
	socket: Bun.Socket<C2RSocketData> | Bun.Socket<R2SSocketData>,
	buffer: Buffer
) => {
	socket.data.sendBuffer = socket.data.sendBuffer
		? Buffer.concat([socket.data.sendBuffer, buffer])
		: buffer
	if (socket.data.sendBuffer.byteLength > 16 * 1024 * 1024) {
		const connId =
			'connId' in socket.data
				? socket.data.connId
				: socket.data.client!.data.connId!
		logger.warn(
			`${colorHash(connId)} Send buffer exceeded 16MB, closing connection`
		)
		socket.end()
	}
	queueMicrotask(() => sendBuffer(socket))
}

const sendBuffer = (
	socket: Bun.Socket<C2RSocketData> | Bun.Socket<R2SSocketData>
) => {
	if (socket.data.sendBuffer) {
		const written = socket.write(socket.data.sendBuffer)
		if (written < socket.data.sendBuffer.byteLength) {
			socket.data.sendBuffer = socket.data.sendBuffer.subarray(written)
		} else {
			socket.data.sendBuffer = null
		}
	}
}

export const InboundSchema = z
	.object({
		bind: z.string().default('0.0.0.0:25565'),
		proxyProtocol: z.boolean().default(false),
	})
	.strict()

// 代理内部能够直接处理的出站规则，用于规范自定义路由器返回的出站
// 实现配置文件时不应直接使用此类型
export const OutboundSchema = z.union([
	z
		.object({
			destination: z.string().nullable(), // 目标服务器地址，如果为 null 则不让连接
			rewriteHost: z.boolean().default(false),
			proxyProtocol: z.boolean().default(false),
		})
		.strict(),
	z.null(),
])

// Minecraft 代理
export class MinecraftProxy {
	inbound: z.infer<typeof InboundSchema> = InboundSchema.parse({})

	reload(config: { inbound?: z.infer<typeof InboundSchema> }) {
		if (config.inbound) this.inbound = config.inbound
	}

	// 创建代理到目标服务器的连接
	private async createR2SConnection(
		clientSocket: Bun.Socket<C2RSocketData>,
		initPacket: Buffer
	) {
		await Bun.connect<R2SSocketData>({
			hostname: clientSocket.data.remoteHost!,
			port: clientSocket.data.remotePort!,
			socket: {
				open: async remoteSocket => {
					remoteSocket.data = {
						client: clientSocket,
						sendBuffer: null,
					}
					clientSocket.data.remote = remoteSocket
					logger.debug(
						`${colorHash(clientSocket.data.connId)} Connected to ${
							clientSocket.data.remoteHost
						}:${clientSocket.data.remotePort}`
					)
					logger.packet(
						`${colorHash(
							clientSocket.data.connId
						)} C2S (Handshake) ${packetToHex(initPacket)}`
					)
					writeToBuffer(clientSocket.data.remote, initPacket)
				},
				close: remoteSocket => {
					clientSocket.end()
				},
				data: (remoteSocket, buffer) => {
					logger.packet(
						`${colorHash(clientSocket.data.connId)} S2C (${
							buffer.byteLength
						} Bytes) ${packetToHex(buffer)}`
					)
					writeToBuffer(clientSocket, buffer)
				},
				drain: remoteSocket => {
					sendBuffer(remoteSocket)
				},
				error: (remoteSocket, error) => {
					logger.error(
						error,
						`${colorHash(clientSocket.data.connId)} remote error`
					)
					remoteSocket.end()
				},
				connectError(remoteSocket, error) {
					logger.error(
						error,
						`${colorHash(clientSocket.data.connId)} remote connect error`
					)
					remoteSocket.end()
				},
			},
		})
	}

	listenPort(bindingAddress: string, bindingPort: number) {
		Bun.listen<C2RSocketData>({
			hostname: bindingAddress,
			port: bindingPort,
			socket: {
				open: clientSocket => {
					clientSocket.data = {
						connId: Math.floor(Math.random() * 100000),
						sendBuffer: null,
						ppStream: new ProxyProtocolPacketStream(),
						C2RStream: new MinecraftPacketStream(),
						protocol: 0,
						state: null,
						remote: null,
						host: null,
						remoteHost: null,
						remotePort: null,
						username: null,
						realRemoteHost: null,
						originIP: null,
						proxyProtocol: null,
						FML: null,
					}

					logger.debug(
						`${colorHash(clientSocket.data.connId)} Connection established`
					)

					if (!this.inbound.proxyProtocol)
						clientSocket.data.originIP = IP.parse(clientSocket.remoteAddress)

					// 若 15 秒内未成功读取握手包，则断开连接
					setTimeout(() => {
						if (clientSocket.data.state === null) {
							logger.warn(
								`${colorHash(clientSocket.data.connId)} Handshake timeout`
							)
							clientSocket.end()
						}
					}, 15000)
				},
				close: async clientSocket => {
					if (clientSocket.data.remote) {
						clientSocket.data.remote.end()
					}
					logger.debug(
						`${colorHash(clientSocket.data.connId)} Connection closed`
					)

					if (clientSocket.data.host && clientSocket.data.username) {
						await globalThis.pluginLoader.disconnect(
							clientSocket.data.host,
							clientSocket.data.username,
							clientSocket.data.originIP!.toString()
						)
					}
				},
				data: async (clientSocket, buffer: Buffer) => {
					logger.packet(
						`${colorHash(clientSocket.data.connId)} C2S (${
							buffer.byteLength
						} Bytes) ${packetToHex(buffer)}`
					)

					// 若已进入游戏状态，则直接转发数据包
					if (clientSocket.data.state === State.Play) {
						writeToBuffer(clientSocket.data.remote!, buffer)
						return
					}

					// 处理 Proxy Protocol v2 头部
					if (!clientSocket.data.originIP) {
						if (!(await clientSocket.data.ppStream.push(buffer))) {
							logger.warn(
								`${colorHash(
									clientSocket.data.connId
								)} Invalid packet: Failed to parse Proxy Protocol v2 (from ${
									clientSocket.remoteAddress
								})`
							)
							clientSocket.end()
							return
						}
						if (clientSocket.data.ppStream.valid()) {
							const srcIP =
								clientSocket.data.ppStream.decode() ??
								IP.parse(clientSocket.remoteAddress)
							clientSocket.data.originIP = srcIP
							logger.debug(
								`${colorHash(
									clientSocket.data.connId
								)} Proxy Protocol v2: ${srcIP}`
							)
							buffer = clientSocket.data.ppStream.getRest()
						} else return
					}

					// 加入解包缓存
					if (!(await clientSocket.data.C2RStream.push(buffer))) {
						logger.warn(
							`${colorHash(
								clientSocket.data.connId
							)} Invalid packet: Max length exceeded (2^21 - 1) Bytes`
						)
						clientSocket.end()
						return
					}

					// 如果未建立连接，则处理握手数据包
					if (!clientSocket.data.state) {
						// 尝试解析数据包
						if (clientSocket.data.C2RStream.havePacket()) {
							let handshake: PacketReader
							try {
								handshake = await clientSocket.data.C2RStream.nextPacket()
							} catch (e) {
								logger.warn(
									`${colorHash(
										clientSocket.data.connId
									)} Invalid handshake packet`
								)
								clientSocket.end()
								return
							}
							// 读取握手数据包
							const packetId = handshake.id
							if (packetId !== 0x0) {
								logger.warn(
									`${colorHash(
										clientSocket.data.connId
									)} Invalid handshake packet id: ${packetId}`
								)
								clientSocket.end()
							}
							const protocol = handshake.readVarInt()
							let host = handshake.readString()
							const port = handshake.readUInt16()
							const nextState = handshake.readVarInt()

							// FML 握手包处理
							if (host.includes('\0FML\0')) {
								clientSocket.data.FML = 1
								host = host.replace(/\0FML\0/g, '')
							} else if (host.includes('\0FML2\0')) {
								clientSocket.data.FML = 2
								host = host.replace(/\0FML2\0/g, '')
							} else clientSocket.data.FML = 0

							clientSocket.data.protocol = protocol
							clientSocket.data.host = host
							clientSocket.data.state = nextState
							logger.info(
								`${colorHash(clientSocket.data.connId)} Handshake: ${
									clientSocket.data.originIP
								} -> ${host}:${port} (protocol=${protocol}, state=${nextState}, FML=${
									clientSocket.data.FML
								})`
							)

							if (nextState === State.Status) {
								const motd = await globalThis.pluginLoader.motd(
									host,
									clientSocket.data.originIP!.toString()
								)
								if (motd) {
									const motdPacket = new PacketWriter(0x0)
									motdPacket.writeJSON(buildMotd(motd))
									clientSocket.write(await buildPacket(motdPacket))
									logger.info(
										`${colorHash(clientSocket.data.connId)} Responsed MOTD`
									)
								}
							}

							if (nextState !== State.Status && nextState !== State.Login) {
								// 无效的后继状态
								logger.warn(
									`${colorHash(
										clientSocket.data.connId
									)} Invalid next state: ${nextState}`
								)
								clientSocket.end()
							}

							if (nextState === State.Login) {
								// 若 15 秒内未成功读取登录包，则断开连接
								setTimeout(() => {
									if (clientSocket.data.state !== State.Play) {
										logger.warn(
											`${colorHash(clientSocket.data.connId)} Login timeout`
										)
										clientSocket.end()
									}
								}, 15000)
							}
						}
					} // 考虑一次发送两个数据包，应当直接在后面处理登录

					// 尝试解析登录数据包
					if (clientSocket.data.state === State.Login) {
						if (clientSocket.data.C2RStream.havePacket()) {
							let login: PacketReader
							try {
								login = await clientSocket.data.C2RStream.nextPacket()
							} catch (e) {
								logger.warn(
									`${colorHash(clientSocket.data.connId)} Invalid login packet`
								)
								clientSocket.end()
								return
							}
							const packetId = login.id
							if (packetId !== 0x0) {
								logger.warn(
									`${colorHash(
										clientSocket.data.connId
									)} Invalid login packet id: ${packetId}`
								)
								clientSocket.end()
							}
							// 登录握手包
							// >= 1.19.1 还传一个 UUID，但是没用
							const username = login.readString()
							logger.info(
								`${colorHash(clientSocket.data.connId)} Login: ${username}`
							)
							clientSocket.data.username = username

							const loginResult = await globalThis.pluginLoader.login(
								clientSocket.data.host!,
								username,
								clientSocket.data.originIP!.toString()
							)
							if (loginResult.type === LoginResultType.REJECT) {
								logger.warn(
									`${colorHash(clientSocket.data.connId)} Login rejected`
								)
								clientSocket.end()
								return
							} else if (loginResult.type === LoginResultType.KICK) {
								const kickPacket = new PacketWriter(0x0)
								kickPacket.writeJSON(loginResult.reason)
								clientSocket.write(await buildPacket(kickPacket)) // 真的还有什么必要等缓存吗？
								logger.warn(
									`${colorHash(
										clientSocket.data.connId
									)} Kicked while logging in`
								)
								clientSocket.end()
								return
							}

							// 通过登录验证，获取出站规则
							const outbound = loginResult.outbound
							if (!outbound || !outbound.destination) {
								logger.warn(
									`${colorHash(clientSocket.data.connId)} No outbound provided`
								)
								clientSocket.end()
								return
							}
							const destination = outbound.destination
							const [remoteHost, remotePort = '25565'] = destination.split(':')
							clientSocket.data.remoteHost = remoteHost
							clientSocket.data.remotePort = parseInt(remotePort)
							const rewriteHost = outbound.rewriteHost
							clientSocket.data.proxyProtocol = outbound.proxyProtocol
							clientSocket.data.realRemoteHost = rewriteHost
								? remoteHost
								: clientSocket.data.host!

							// TODO: 用户名验证

							// 缓冲区中不应该还有数据包
							if (clientSocket.data.C2RStream.havePacket()) {
								logger.warn(
									`${colorHash(
										clientSocket.data.connId
									)} Unexpected packet after login packet`
								)
								clientSocket.end()
							}

							logger.debug(
								`${colorHash(clientSocket.data.connId)} Connecting to ${
									clientSocket.data.remoteHost
								}:${clientSocket.data.remotePort}`
							)

							// 创建到目标服务器的连接

							let headers: Buffer = Buffer.alloc(0)

							if (clientSocket.data.proxyProtocol) {
								// 构造 Proxy Protocol v2 头部
								const createProxyAddress = (
									ip: IP
								): IPv4ProxyAddress | IPv6ProxyAddress => {
									if (ip.version === 4) {
										return new IPv4ProxyAddress(
											IPv4Address.createFrom(ip._bytes),
											0,
											IPv4Address.createFrom([0, 0, 0, 0]), // Placeholder for destination IP
											0 // Placeholder for destination port
										)
									} else
										return new IPv6ProxyAddress(
											IPv6Address.createFrom(ip._words),
											0,
											IPv6Address.createFrom([0, 0, 0, 0, 0, 0, 0, 0]), // Placeholder for destination IP
											0 // Placeholder for destination port
										)
								}

								const pp = new V2ProxyProtocol(
									Command.LOCAL,
									TransportProtocol.DGRAM,
									createProxyAddress(clientSocket.data.originIP!)
								)
								headers = Buffer.from(pp.build())
							}

							// 构造握手包
							const remoteHostWithFML =
								clientSocket.data.FML! > 0
									? `${clientSocket.data.realRemoteHost}\0FML${clientSocket.data.FML}\0`
									: clientSocket.data.realRemoteHost!
							const handshake = new PacketWriter(0x0)
							handshake.writeVarInt(clientSocket.data.protocol)
							handshake.writeString(remoteHostWithFML)
							handshake.writeUInt16(clientSocket.data.remotePort!)
							handshake.writeVarInt(State.Login)

							headers = Buffer.concat([
								headers,
								await buildPacket(handshake),
								await buildPacket(login), // 重新将登录包封包
							])

							await this.createR2SConnection(clientSocket, headers)

							clientSocket.data.state = State.Play
						}
					}
				},
				drain(clientSocket) {
					sendBuffer(clientSocket)
				},
				error: (clientSocket, error) => {
					logger.error(
						error,
						`${colorHash(clientSocket.data.connId)} client error`
					)
				},
			},
		})
	}
}
