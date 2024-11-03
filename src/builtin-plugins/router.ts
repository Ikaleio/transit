import { isMatch } from 'micromatch'
import { LoginResultType, type Context } from '../plugins'

export const name = 'router'

// 为了方便，直接从 ctx.fullConfig 中获取配置
// 而不是定义自己的配置模式

export const apply = (ctx: Context) => {
	logger.info(`Router plugin loaded: ${ctx.fullConfig.routes.length} route(s)`)

	ctx.on('login', async (ctx: Context, _next: Function) => {
		const route = ctx.fullConfig.routes.find(route =>
			isMatch(ctx.host!, route.host),
		)
		if (route) {
			logger.info(`Routing ${ctx.host} to ${route.destination}`)
			return {
				type: LoginResultType.PASS,
				outbound: {
					destination: route.destination,
					rewriteHost: route.rewriteHost,
					proxyProtocol: route.proxyProtocol,
					removeFMLSignature: route.removeFMLSignature,
				},
			}
		}
		return _next()
	})

	ctx.on('motd', async (ctx: Context, _next: Function) => {
		// 读取 ctx.fullConfig.motd 字段
		if (ctx.fullConfig.motd) {
			return ctx.fullConfig.motd
		}
		return _next()
	})
}
