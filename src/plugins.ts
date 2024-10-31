import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { Component, MotdSchema } from './motd'
import { OutboundSchema } from './proxy'
import { fromError } from 'zod-validation-error'
import { ConfigSchema } from './config'

export enum LoginResultType {
	PASS,
	REJECT,
	KICK,
}

// 定义插件返回的类型
export type PluginLoginResult =
	| { type: LoginResultType.PASS; outbound: z.input<typeof OutboundSchema> }
	| { type: LoginResultType.REJECT }
	| { type: LoginResultType.KICK; reason: z.input<typeof Component> }

// 定义 PluginLoader.login 返回的类型
export type LoaderLoginResult =
	| { type: LoginResultType.PASS; outbound: z.infer<typeof OutboundSchema> }
	| { type: LoginResultType.REJECT }
	| { type: LoginResultType.KICK; reason: z.infer<typeof Component> }

type MotdHandler = (
	ctx: Context,
	_next: Function
) => Promise<z.input<typeof MotdSchema>> | z.input<typeof MotdSchema>

type LoginHandler = (
	ctx: Context,
	_next: Function
) => Promise<PluginLoginResult> | PluginLoginResult

type Handler = MotdHandler | LoginHandler

// 传递给插件的上下文
export interface Context {
	host?: string
	ip?: string
	playerName?: string
	config?: any
	fullConfig: z.infer<typeof ConfigSchema> // 添加 fullConfig 属性，确保其为必填项
	on(event: 'motd', handler: MotdHandler, pre?: boolean): void
	on(event: 'login', handler: LoginHandler, pre?: boolean): void
	on(
		event: 'disconnect',
		handler: (ctx: Context) => Promise<void> | void,
		pre?: boolean
	): void
	temp?(callback: Handler): void
}

// 插件的接口
export interface PluginInterface {
	name: string
	ConfigSchema?: z.ZodSchema<any> // 可选的配置模式
	apply(ctx: Context): void | Promise<void> // 插件的主逻辑
	dispose?(): void | Promise<void> // 可选的清理逻辑
}

// 插件加载器
export class PluginLoader {
	private plugins: PluginInterface[] = []
	private eventHandlers: {
		[key: string]: Array<Function>
	} = {
		login: [],
		disconnect: [],
		motd: [],
	}
	private fullConfig: z.infer<typeof ConfigSchema> = ConfigSchema.parse({}) // 保存完整的配置

	async loadBuiltInPlugins(
		config: z.infer<typeof ConfigSchema>
	): Promise<void> {
		const builtinPluginsDir = path.resolve(__dirname, 'builtin-plugins')
		const builtinFiles = await fs.readdir(builtinPluginsDir)
		for (const file of builtinFiles) {
			const ext = path.extname(file)
			if (
				ext === '.ts' ||
				ext === '.js' ||
				ext === '.cjs' ||
				ext === '.mjs' ||
				ext === '.tsx' ||
				ext === '.jsx'
			) {
				const pluginPath = path.resolve(builtinPluginsDir, file)
				try {
					// 动态导入插件
					const pluginModule = await import(pluginPath)
					const plugin: PluginInterface = pluginModule.default || pluginModule

					// 检查插件的基础结构
					if (!plugin || typeof plugin.apply !== 'function' || !plugin.name) {
						throw new Error(`Invalid plugin format: ${pluginPath}`)
					}

					// 获取插件的配置
					let pluginConfig = config.plugins
						? config.plugins[plugin.name] || {}
						: {}

					// 如果插件提供了 ConfigSchema，则验证配置
					if (plugin.ConfigSchema) {
						pluginConfig = plugin.ConfigSchema.parse(pluginConfig)
					}

					// 创建插件的上下文
					const context: Context = {
						config: pluginConfig,
						fullConfig: this.fullConfig, // 传入完整的配置
						on: (event, handler, pre = false) => {
							if (this.eventHandlers[event]) {
								if (pre) {
									this.eventHandlers[event].unshift(handler)
								} else this.eventHandlers[event].push(handler)
							}
						},
					}

					// 调用插件的 apply 方法进行初始化
					await plugin.apply(context)

					// 插件加入已加载列表
					this.plugins.push(plugin)

					logger.debug(`Builtin plugin loaded: ${plugin.name}`)
				} catch (e: unknown) {
					if (e instanceof z.ZodError) {
						const errorStr = fromError(e).message
						logger.error(
							`Failed to load builtin plugin ${pluginPath}: ${errorStr}`
						)
					} else {
						logger.error(e, `Failed to load builtin plugin ${pluginPath}`)
					}
				}
			}
		}
	}

	// 加载插件
	async loadPlugins(
		pluginsDirectory: string,
		config: z.infer<typeof ConfigSchema>
	): Promise<void> {
		// 先卸载所有的已存在插件
		await this.unloadPlugins()

		this.fullConfig = config

		// 加载内置插件
		await this.loadBuiltInPlugins(config)

		if (!(await fs.stat(pluginsDirectory).catch(() => false))) {
			logger.warn(`Plugins directory not found: ${pluginsDirectory}`)
			return
		}

		const files = await fs.readdir(pluginsDirectory)
		const pluginsConfig = config.plugins || {}

		for (const file of files) {
			const ext = path.extname(file)
			if (
				ext === '.ts' ||
				ext === '.js' ||
				ext === '.cjs' ||
				ext === '.mjs' ||
				ext === '.tsx' ||
				ext === '.jsx'
			) {
				const pluginPath = path.resolve(pluginsDirectory, file)
				try {
					// 动态导入插件
					const pluginModule = await import(pluginPath)
					const plugin: PluginInterface = pluginModule.default || pluginModule

					// 检查插件的基础结构
					if (!plugin || typeof plugin.apply !== 'function' || !plugin.name) {
						throw new Error(`Invalid plugin format: ${pluginPath}`)
					}

					// 获取插件的配置
					let pluginConfig = pluginsConfig[plugin.name] || {}

					// 如果插件提供了 ConfigSchema，则验证配置
					if (plugin.ConfigSchema) {
						pluginConfig = plugin.ConfigSchema.parse(pluginConfig)
					}

					// 创建插件的上下文
					const context: Context = {
						config: pluginConfig,
						fullConfig: this.fullConfig, // 传入完整的配置
						on: (event, handler, pre = false) => {
							if (this.eventHandlers[event]) {
								if (pre) {
									this.eventHandlers[event].unshift(handler)
								} else this.eventHandlers[event].push(handler)
							}
						},
					}

					// 调用插件的 apply 方法进行初始化
					await plugin.apply(context)

					// 插件加入已加载列表
					this.plugins.push(plugin)

					logger.debug(`Plugin loaded: ${plugin.name}`)
				} catch (e: unknown) {
					if (e instanceof z.ZodError) {
						const errorStr = fromError(e).message
						logger.error(
							`Failed to load builtin plugin ${pluginPath}: ${errorStr}`
						)
					} else {
						logger.error(e, `Failed to load builtin plugin ${pluginPath}`)
					}
				}
			}
		}
	}

	// 处理登录事件
	async login(
		host: string,
		playerName: string,
		ip: string
	): Promise<LoaderLoginResult> {
		// 创建临时回调函数队列
		const tempHandlers: Array<LoginHandler> = []

		// 创建完整的上下文，包括 temp 方法
		const ctx: Context = {
			host,
			playerName,
			ip,
			fullConfig: this.fullConfig, // 传入完整的配置
			on: (event, handler, pre = false) => {
				if (this.eventHandlers[event]) {
					if (pre) {
						this.eventHandlers[event].unshift(handler)
					} else this.eventHandlers[event].push(handler)
				}
			},
			temp: (callback: LoginHandler) => {
				tempHandlers.push(callback)
			},
		}

		// 递归调用事件处理器
		const _next = async (index: number): Promise<LoaderLoginResult> => {
			if (index >= this.eventHandlers['login'].length) {
				// 处理 tempHandlers 队列
				return processTempHandlers(0)
			}

			const handler = this.eventHandlers['login'][index]
			try {
				const result = await handler(ctx, () => _next(index + 1))
				if (result) {
					// 根据 result.type 解析相应的字段
					switch (result.type) {
						case LoginResultType.PASS:
							return {
								type: LoginResultType.PASS,
								outbound: OutboundSchema.parse(result.outbound),
							}
						case LoginResultType.KICK:
							return {
								type: LoginResultType.KICK,
								reason: Component.parse(result.reason),
							}
						case LoginResultType.REJECT:
							return {
								type: LoginResultType.REJECT,
							}
					}
				}
			} catch (error) {
				logger.error(error, `Error in login handler at index ${index}`)
			}

			return _next(index + 1)
		}

		// 处理 tempHandlers 队列的函数
		const processTempHandlers = async (
			index: number
		): Promise<LoaderLoginResult> => {
			if (index >= tempHandlers.length) {
				return {
					type: LoginResultType.REJECT,
				}
			}

			const handler = tempHandlers[index]
			try {
				const result = await handler(ctx, () => processTempHandlers(index + 1))
				if (result) {
					switch (result.type) {
						case LoginResultType.PASS:
							return {
								type: LoginResultType.PASS,
								outbound: OutboundSchema.parse(result.outbound),
							}
						case LoginResultType.KICK:
							return {
								type: LoginResultType.KICK,
								reason: Component.parse(result.reason),
							}
						case LoginResultType.REJECT:
							return {
								type: LoginResultType.REJECT,
							}
					}
				}
			} catch (error) {
				logger.error(error, `Error in temp login handler at index ${index}`)
			}

			return processTempHandlers(index + 1)
		}

		return _next(0)
	}

	// 处理 MOTD 事件
	async motd(host: string, ip: string): Promise<z.infer<typeof MotdSchema>> {
		// 创建临时回调函数队列
		const tempHandlers: Array<MotdHandler> = []

		// 创建完整的上下文，包括 temp 方法
		const ctx: Context = {
			host,
			ip,
			fullConfig: this.fullConfig, // 传入完整的配置
			on: (event, handler, pre = false) => {
				if (this.eventHandlers[event]) {
					if (pre) {
						this.eventHandlers[event].unshift(handler)
					} else this.eventHandlers[event].push(handler)
				}
			},
			temp: (callback: MotdHandler) => {
				tempHandlers.push(callback)
			},
		}

		// 递归调用事件处理器
		const _next = async (
			index: number
		): Promise<z.infer<typeof MotdSchema>> => {
			if (index >= this.eventHandlers['motd'].length) {
				// 处理 tempHandlers 队列
				return processTempHandlers(0)
			}

			const handler = this.eventHandlers['motd'][index]
			try {
				const result = await handler(ctx, () => _next(index + 1))
				if (result) {
					// 解析插件返回的结果
					return MotdSchema.parse(result)
				}
			} catch (error) {
				logger.error(error, `Error in MOTD handler at index ${index}`)
			}

			return _next(index + 1)
		}

		// 处理 tempHandlers 队列的函数
		const processTempHandlers = async (
			index: number
		): Promise<z.infer<typeof MotdSchema>> => {
			if (index >= tempHandlers.length) {
				// 默认的 MOTD 响应
				return MotdSchema.parse({
					text: 'Welcome to the server!',
					color: 'yellow',
				})
			}

			const handler = tempHandlers[index]
			try {
				const result = await handler(ctx, () => processTempHandlers(index + 1))
				if (result) {
					return MotdSchema.parse(result)
				}
			} catch (error) {
				logger.error(error, `Error in temp MOTD handler at index ${index}`)
			}

			return processTempHandlers(index + 1)
		}

		return _next(0)
	}

	// 处理断开连接事件
	async disconnect(
		host: string,
		playerName: string,
		ip: string
	): Promise<void> {
		// 创建完整的上下文，包括 `on` 方法，提供 host, playerName, ip, config 和 fullConfig
		const ctx: Context = {
			host,
			playerName,
			ip,
			fullConfig: this.fullConfig, // 传入完整的配置
			on: (event, handler, pre = false) => {
				if (this.eventHandlers[event]) {
					if (pre) {
						this.eventHandlers[event].unshift(handler)
					} else this.eventHandlers[event].push(handler)
				}
			},
		}

		for (const handler of this.eventHandlers['disconnect']) {
			try {
				await handler(ctx)
			} catch (error) {
				logger.error(error, `Error in disconnect handler`)
			}
		}
	}

	// 卸载所有插件
	async unloadPlugins(): Promise<void> {
		for (const plugin of this.plugins) {
			try {
				if (plugin.dispose) {
					await plugin.dispose()
				}
				logger.debug(`Plugin unloaded: ${plugin.name}`)
			} catch (error) {
				logger.error(error, `Error disposing plugin ${plugin.name}`)
			}
		}
		this.plugins = []
		this.eventHandlers = {
			login: [],
			disconnect: [],
			motd: [],
		}
	}
}
