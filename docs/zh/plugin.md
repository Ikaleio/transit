# 插件系统

该页面详细介绍了 Transit 的插件系统，以及插件语法。

## 概述

Transit 在加载（重载）配置文件时会尝试在工作目录的 `plugins/` 文件夹下加载插件。插件是用 TypeScript/JavaScript 编写的事件处理器，通过实现一组接口与 Transit 主程序交互。

目前，Transit 插件可用于实现自定义路由、身份验证和 motd 信息。

Transit 的路由系统也是作为内置插件实现的。

::: tip
虽然 Transit 会尝试加载 `.ts`/`.js`/`.jsm`/`.cjs` 等各类 TypeScript/JavaScript 源码文件，但我们仅保证 TypeScript 支持。

由于 Bun 可以直接加载 `.ts` 文件，你不需要任何转译器。直接在 `plugins/` 目录下编写代码并使用相对引用即可（享受 IDE 的自动补全吧）。

在开发模式（`bun dev`）下插件会自动热重载。
:::

## 开发

以下是一个最简单的插件：

```ts
import { type Context } from '../src/plugins'

export const name = 'example'

export const apply = (ctx: Context) => {
	logger.info(`Hello World!`)
}
```

它的功能是当自身被加载时向控制台输出一行 "Hello World!"。

其中 `apply` 函数是整个插件的入口，它在加载时调用，参数 `ctx` 是当前调用的上下文，其中包含许多有用的函数与变量，包括当前配置文件和事件处理器注册函数。

### 事件处理器

Transit 插件通过**事件处理器**对一些事件做出回应，使用 `ctx.on(event, handler, pre=false)` 注册一个事件处理器。

```ts
export const apply = (ctx: Context) => {
	ctx.on(
		'login',
		async (ctx: Context, _next: Function) => {
			logger.info(`example plugin: Incoming login request ${ctx.playerName!}`)
			return _next()
		},
		// 第三个参数(pre) 为 true 时，该事件处理器将会优先调用
		// 默认情况下内置插件具有更高的优先级，因此如果没有这个 true，响应链很可能在
		// 路由阶段（由内置插件 Router）产生结果并终止，从而看不到日志
		true,
	)
}
```

这段代码注册了一个处理登录事件的处理器。当玩家登入时，它会在控制台打印玩家的 Minecraft 用户名。

事件处理器的第二个参数就是调用的回调函数。可以从回调函数传入的上下文中获得玩家名（`ctx.playerName`），玩家 IP（`ctx.ip`），玩家连入地址（`ctx.ip`）等信息。

### 处理链

刚刚我们并没有介绍回调函数的第二个参数（`_next`）的作用，这需要引入「处理链」的概念。

大部分情况下对于同一个事件不可能只有一个事件处理器，处理链用于协调各个事件处理器。

当一个事件触发时，Transit 默认按照**插件加载顺序**依次执行每个插件的所有符合该事件的事件处理器，直到其中一个事件处理器给出有意义的结果。这个「处理过程」执行的事件处理器就叫「处理链」。

`_next()` 函数返回的就是下一个事件处理器给出的结果。

### 返回结果

有些事件（例如 `disconnect`）并不需要 Transit 做出处理，因此无须返回值，也没有 `_next()` 函数。

但是对于 `login` 和 `motd` 事件，你可能需要返回一个有效结果。

对于 `login` 事件，我们给出了 `PluginLoginResult` 类型作为返回值。以下代码简要介绍了该类型的使用。

```ts
import { LoginResultType, type Context } from '../src/plugins'

export const name = 'example'

export const apply = (ctx: Context) => {
	logger.info(`example plugin loaded`)
	ctx.on(
		'login',
		async (ctx, _next) => {
			if (ctx.playerName! !== 'Ikaleio') {
				// 简单的白名单系统，如果玩家名不是 Ikaleio，就踢掉
				return {
					type: LoginResultType.KICK, // 代表「踢出玩家」操作

					// 踢出时显示的原因，支持 Minecraft 格式代码或 Minecraft 对象型文本组件
					reason: '§cYou are not §l§n§oIkaleio§c!',
				}
			}
			if (ctx.ip !== '11.45.1.4') {
				return {
					// 代表「拒绝连接」操作，会直接关闭连接而不显示任何信息
					type: LoginResultType.REJECT,
				}
			}
			if (ctx.host === 'hypixel.example.com') {
				return {
					type: LoginResultType.PASS, // 代表「路由」操作
					outbound: {
						// 参考「配置文件」部分的路由出站配置
						destination: 'mc.hypixel.net',
						rewriteHost: true,
					},
				}
			}
			// 若以上条件均不满足，则让下一个事件处理器响应
			// 如果你只是想造一个白名单并用配置文件进行路由，你应当 return _next() 而不是 PASS
			return _next()
		},
		true,
	)
}
```

对于 `motd` 事件，你可以直接返回 `MotdSchema`，就像你在配置文件里写 motd 时那样。

:::tip
`motd` 事件没有 `ctx.playerName`，因为 Minecraft 客户端并不会在请求 motd 时发送玩家名。

`disconnect` 事件仅在玩家登入服务器后退出时才会触发，例如，`motd` 请求的结束并不会触发 `disconnect`。
:::

### 副作用安全

由于 Transit 实现插件配置热重载的方法是检测到配置文件变动时卸载全部插件（同时清空所有事件处理器）并重新加载，当你在插件中使用 http 服务器等带状态的东西时，必须在 `dispose` 时把它关闭/析构。这就是「副作用安全」。

```ts
export const dispose = (ctx: Context) => {
	yourHttpServer?.dispose()
}
```

### 临时事件处理器

由于你无法决定插件的加载顺序，你可能会在「实现一个最先/最后处理的事件处理器」的需求上遇到不便。对于前者，我们有「优先事件处理器」（详见「事件处理器」一节的示例代码），而对于后者，我们可以使用「临时事件处理器」。

临时事件处理器具有最低的优先级，它会在响应链的最后执行（并且仅对该响应链有效），无论它是被哪个插件注册的，这使它起到了「兜底」的作用。

```ts
ctx.on('login', async (ctx, _next) => {
	// 对该响应链注册一个临时事件处理器
	ctx.temp!((ctx, _next) => {
		logger.warn(`Unkown host: ${ctx.host!}`)
		return {
			type: LoginResultType.KICK,
			reason: 'No route registered for this host',
		}
	})
	return _next()
})
```

以上代码当且仅当没有其他任何插件返回有效路由（`LoginResultType.PASS`）时向客户端告知「当前地址无路由可用」。

### 配置构型

有时你的插件需要用户填写配置，你可以使用「配置构型」实现这一点，同时可以得到 Zod 的自动配置验证。

只需要在主程序内导出 Zod 类型常量 `ConfigSchema`，就会在插件加载时传入配置文件。

```ts
import { z } from 'zod'
import { type Context } from '../src/plugins'

export const name = 'example'

export const ConfigSchema = z.object({
	exampleString: z.string(),
	exampleNumberWithLimit: z.number().min(0).max(100),
	exampleBooleanWithDefault: z.boolean().default(true),
})

export const apply = (ctx: Context) => {
	logger.info(
		`example plugin loaded ${ctx.config.exampleString} ${ctx.config.exampleNumberWithLimit} ${ctx.config.exampleBooleanWithDefault}`,
	)
}
```

```yml
# config.yml
plugins:
  example:
    exampleString: ikaleio
	exampleNumberWithLimit: 42

# example plugin loaded ikaleio 42 true
```
