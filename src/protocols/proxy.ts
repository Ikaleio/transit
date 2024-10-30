import { IP } from '@hownetworks/ipv46'
import {
	IPv4Address,
	IPv6Address,
	ProxyProtocolIdentifier,
	ProxyProtocolVersion,
	V2ProxyProtocol,
	V2ProxyProtocolParseError,
	AddressFamilyType,
	Command,
	IPv4ProxyAddress,
	IPv6ProxyAddress,
} from 'proxy-protocol-js'

const stringifyAddress = (address: IPv4Address | IPv6Address) => {
	if (address instanceof IPv4Address) {
		return address.address.join('.')
	}
	return address.address.map(part => part.toString(16)).join(':')
}

// 流式解码 ProxyProtocol 头部
export class ProxyProtocolPacketStream {
	private buffer = Buffer.alloc(0)
	private originIp: IP | null = null
	private validHeader = false

	private V2_HEADER_SIGNATURE = Buffer.from('\r\n\r\n\x00\r\nQUIT\n')

	// TODO: 用 Result API 实现异常处理
	async push(chunk: Buffer): Promise<boolean> {
		this.buffer = Buffer.concat([this.buffer, chunk])

		// 如果 buffer 的大小超过了 576 Bytes（ProxyProtocol 头部的最大长度）则强制终止
		// 这个值不一定准确，因为 ProxyProtocol v2 可带有扩展字段，很难知道它的确切长度
		if (this.buffer.length > 576) {
			return false
		}

		if (this.buffer.length >= 12) {
			// 如果不是 ProxyProtocol 头部则直接返回
			if (!this.buffer.subarray(0, 12).equals(this.V2_HEADER_SIGNATURE))
				return false
		}

		const proxyProtocolVersion = ProxyProtocolIdentifier.identify(this.buffer)
		if (proxyProtocolVersion === ProxyProtocolVersion.V1) {
			return false // 不支持 ProxyProtocol v1
		}
		if (proxyProtocolVersion === ProxyProtocolVersion.V2) {
			let header: V2ProxyProtocol
			try {
				header = V2ProxyProtocol.parse(this.buffer)
			} catch (e) {
				if (e instanceof V2ProxyProtocolParseError) {
					return false
				} else {
					throw e
				}
			}
			if (
				header.addressFamilyType === AddressFamilyType.UNIX ||
				header.addressFamilyType === AddressFamilyType.UNSPEC
			) {
				return false // 不支持 UNIX 套接字和未指定地址族
			}
			this.validHeader = true
			this.buffer = Buffer.from(header.data ?? Buffer.alloc(0))
			if (header.command === Command.LOCAL) {
				this.originIp = null
				return true
			}
			this.originIp = IP.parse(
				stringifyAddress(
					(header.proxyAddress as IPv4ProxyAddress | IPv6ProxyAddress)
						.sourceAddress
				)
			)
			return true
		}

		return true
	}

	valid(): boolean {
		return this.validHeader
	}

	decode(): IP | null {
		if (!this.validHeader) {
			throw new Error('No valid ProxyProtocol header decoded')
		}
		return this.originIp // null 代表无须更改源地址
	}

	getRest(): Buffer {
		return this.buffer
	}
}
