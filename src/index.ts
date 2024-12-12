import pino, { type Logger } from 'pino'
import { ConfigSchema, IOError, loadConfig, saveConfig } from './config'
import { watch, type FSWatcher } from 'fs'
import pretty from 'pino-pretty'
import { MinecraftProxy } from './proxy'
import { fromError } from 'zod-validation-error'
import { PluginLoader } from './plugins'
import { getGitCommitHash } from './macros/getGitCommitHash' with { type: 'macro' }
import { generateHeapSnapshot } from 'bun'

export type TransitLogger = Logger<'packet', boolean>

declare global {
	var logger: TransitLogger
	var configWatcher: FSWatcher | null
	var pluginLoader: PluginLoader
}

// Bun build 不允许顶层 await，因此使用 async function 包裹
async function main() {
	globalThis.logger = pino(
		{
			customLevels: {
				packet: 5,
			},
		},
		pretty({
			colorize: true,
			translateTime: true,
			ignore: 'pid,hostname',
		}),
	)

	const minecraftProxy = new MinecraftProxy()

	logger.info(`Transit Proxy by Ikaleio (build: ${await getGitCommitHash()})`)

	let resultLoadConfig = await loadConfig('./config.yml')
	if (resultLoadConfig.isError()) {
		if (resultLoadConfig.error instanceof IOError) {
			logger.warn(`Config file not found, creating a new one...`)
			const defaultConfig = ConfigSchema.parse({
				routes: [
					{
						host: '*',
						destination: 'mc.hypixel.net',
						rewriteHost: true,
					},
				],
			})
			const { motd, flags, ...defaultConfigToSave } = defaultConfig
			const saveConfigResult = await saveConfig(
				'./config.yml',
				defaultConfigToSave,
			)
			if (saveConfigResult.isError()) {
				const errorStr = fromError(saveConfigResult.error).message
				logger.error(`Failed to create default config file: ${errorStr}`)
				process.exit(1)
			}
			resultLoadConfig = await loadConfig('./config.yml')
		} else {
			const errorStr = fromError(resultLoadConfig.error).message
			logger.error(`Failed to load config: ${errorStr}`)
			process.exit(1)
		}
	}

	let config = resultLoadConfig.value!
	logger.level = config.logger.level
	logger.info('Config file loaded & validated')

	globalThis.pluginLoader = new PluginLoader()
	pluginLoader.loadPlugins('./plugins', config)

	minecraftProxy.reload({
		inbound: config.inbound,
		flags: config.flags,
	})

	// 监听配置文件变化
	let reloadLock = false
	let debounceTimeout: NodeJS.Timer | null = null

	const setupConfigWatcher = () => {
		if (globalThis.configWatcher) {
			globalThis.configWatcher.close()
		}
		globalThis.configWatcher = watch('./config.yml', async event => {
			if (reloadLock) return
			if (debounceTimeout) clearTimeout(debounceTimeout)

			debounceTimeout = setTimeout(async () => {
				reloadLock = true
				logger.info(`Config file changed (event=${event})`)
				const resultLoadConfig = await loadConfig('./config.yml')
				if (resultLoadConfig.isError()) {
					const errorStr = fromError(resultLoadConfig.error).message
					logger.error(`Failed to load config: ${errorStr}`)
					return
				}
				config = resultLoadConfig.value!

				logger.level = config.logger.level
				minecraftProxy.reload({
					inbound: config.inbound,
					flags: config.flags,
				})
				await pluginLoader.loadPlugins('./plugins', config)

				logger.info('Config file reloaded & validated')
				reloadLock = false
			}, 100)
		})
	}

	setupConfigWatcher()

	const [bindingAddress, bindingPort] = config.inbound.bind.split(':')

	minecraftProxy.listenPort(bindingAddress, parseInt(bindingPort))

	logger.info(`Listening on ${bindingAddress}:${bindingPort}`)

	const saveHeapSnapshot = async () => {
		const snapshot = generateHeapSnapshot()
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		await Bun.write(
			`dump/heap-${timestamp}.json`,
			JSON.stringify(snapshot, null, 2),
		)
		logger.info(`Heap snapshot saved at dump/heap-${timestamp}.json`)
	}

	await saveHeapSnapshot()
	// 每小时生成并存储内存快照
	setInterval(saveHeapSnapshot, 3600000) // 3600000 毫秒 = 1 小时
}

main()
