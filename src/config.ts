import { z } from 'zod'
import * as yaml from 'yaml'
import * as fs from 'fs/promises'
import { Result } from 'typescript-result'
import { MotdSchema } from './motd'
import { InboundSchema } from './proxy'

export class IOError extends Error {
	readonly type = 'io-error'
}
export class ParseError extends Error {
	readonly type = 'parse-error'
}

const loggerSchema = z
	.object({
		level: z
			.enum([
				'packet',
				'slient',
				'trace',
				'debug',
				'info',
				'warn',
				'error',
				'fetal',
			])
			.default('info'),
	})
	.strict()

const RouteSchema = z
	.object({
		host: z.string(),
		destination: z.string(),
		rewriteHost: z.boolean().default(false),
		proxyProtocol: z.boolean().default(false),
		removeFMLSignature: z.boolean().default(false),
	})
	.strict()

export const ConfigSchema = z
	.object({
		logger: loggerSchema.default(loggerSchema.parse({})),
		inbound: InboundSchema.default(InboundSchema.parse({})),
		routes: z.array(RouteSchema).default([]),
		motd: MotdSchema.default(MotdSchema.parse({})),
		plugins: z.any().nullable().default(undefined), // 必须在运行时推导
	})
	.strict()

const readFile = async (path: string) => {
	return Result.try(
		() => fs.readFile(path, 'utf-8'),
		err => new IOError(`Failed to read file: ${path}`, { cause: err }),
	)
}

export const loadConfig = async (path: string) => {
	const result = (await readFile(path))
		.mapCatching(
			content => yaml.parse(content),
			error => new ParseError(`Failed to parse config file`, { cause: error }),
		)
		.mapCatching(ConfigSchema.parse)
	return result
}

export const saveConfig = async (
	path: string,
	config: z.input<typeof ConfigSchema>,
) => {
	const result = Result.try(
		() => yaml.stringify(config),
		err => new ParseError(`Failed to stringify config`, { cause: err }),
	).mapCatching(
		async (content: string) => await fs.writeFile(path, content),
		err => new IOError(`Failed to write file: ${path}`, { cause: err }),
	)
	return result
}
