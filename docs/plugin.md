# Plugin System

This page provides a detailed explanation of the Transit plugin system, including the syntax for plugins.

## Overview

When Transit loads (or reloads) its configuration file, it attempts to load plugins from the `plugins/` directory in the working folder. Plugins are event handlers written in TypeScript/JavaScript that interact with the main Transit program by implementing a set of interfaces.

Currently, Transit plugins can be used to implement custom routing, authentication, and motd (Message of the Day) information.

Transit's routing system is also implemented as a built-in plugin.

::: tip
Although Transit attempts to load various types of TypeScript/JavaScript source files such as `.ts`, `.js`, `.jsm`, `.cjs`, etc., we only guarantee support for TypeScript.

Since Bun can directly load `.ts` files, you don't need any transpiler. Just write your code in the `plugins/` directory and use relative references (enjoy the auto-completion from your IDE).

Plugins automatically hot-reload in development mode (`bun dev`).
:::

## Development

Here is the simplest plugin:

```ts
import { type Context } from '../src/plugins'

export const name = 'example'

export const apply = (ctx: Context) => {
	logger.info(`Hello World!`)
}
```

Its function is to output "Hello World!" to the console when it is loaded.

The `apply` function is the entry point of the entire plugin, called upon loading, with the parameter `ctx` being the current context, which contains many useful functions and variables, including the current configuration file and event handler registration functions.

### Event Handlers

Transit plugins respond to certain events with **event handlers**, which are registered using `ctx.on(event, handler, pre=false)`.

```ts
export const apply = (ctx: Context) => {
	ctx.on(
		'login',
		async (ctx: Context, _next: Function) => {
			logger.info(
				`example plugin: Incoming login request from ${ctx.playerName!}`,
			)
			return _next()
		},
		// The third parameter (pre) set to true means that this event handler will be called first.
		// By default, built-in plugins have a higher priority, so without this true, the response
		// chain is likely to produce a result and terminate during the routing phase (handled by the
		// built-in Router plugin), thus you wouldn't see the log.
		true,
	)
}
```

This code registers a handler for the login event. When a player logs in, it will print the player's Minecraft username to the console.

The second parameter of the event handler is the callback function. You can get the player's name (`ctx.playerName`), player IP (`ctx.ip`), and the address the player connected from (`ctx.ip`) from the context passed to the callback.

### Processing Chain

We have not yet introduced the role of the second parameter of the callback function (`_next`), which requires the concept of a "processing chain".

In most cases, it's unlikely that there is only one event handler for an event. The processing chain is used to coordinate multiple event handlers.

When an event is triggered, Transit by default executes each plugin's event handlers for that event in the order the plugins were loaded, until one of the handlers returns a meaningful result. The "processing" of event handlers that are executed is called the "processing chain".

The `_next()` function returns the result given by the next event handler.

### Returning Results

Some events (such as `disconnect`) do not require Transit to process, so they don't need a return value, nor is there an `_next()` function.

However, for `login` and `motd` events, you may need to return a valid result.

For the `login` event, we provide the `PluginLoginResult` type as a return value. The following code briefly introduces the use of this type.

```ts
import { LoginResultType, type Context } from '../src/plugins'

export const name = 'example'

export const apply = (ctx: Context) => {
	logger.info(`example plugin loaded`)
	ctx.on(
		'login',
		async (ctx, _next) => {
			if (ctx.playerName! !== 'Ikaleio') {
				// A simple whitelist system. If the player's name is not Ikaleio, kick them.
				return {
					type: LoginResultType.KICK, // Represents the action of "kicking out the player"

					// The reason shown when kicking out, supports Minecraft formatting codes or
					// Minecraft object-type text components
					reason: '§cYou are not §l§n§oIkaleio§c!',
				}
			}
			if (ctx.ip !== '11.45.1.4') {
				return {
					// Represents the action of "rejecting the connection", which will simply close
					// the connection without displaying any information
					type: LoginResultType.REJECT,
				}
			}
			if (ctx.host === 'hypixel.example.com') {
				return {
					type: LoginResultType.PASS, // Represents the "routing" action
					outbound: {
						// Refer to the routing outbound configuration in the "Configuration File" section
						destination: 'mc.hypixel.net',
						rewriteHost: true,
					},
				}
			}
			// If none of the above conditions are met, let the next event handler respond
			// If you just want to create a whitelist and use the configuration file for routing,
			// you should return _next() instead of PASS
			return _next()
		},
		true,
	)
}
```

For the `motd` event, you can directly return `MotdSchema`, just as you would write motd in the configuration file.

:::tip
The `motd` event does not have `ctx.playerName` because the Minecraft client does not send the player's name when requesting motd.

The `disconnect` event is only triggered when a player leaves the server after logging in, for example, the end of a `motd` request does not trigger `disconnect`.
:::

### Side Effect Safety

Since the method Transit implements for plugin configuration hot-reloading is to unload all plugins (and clear all event handlers) when detecting configuration file changes and then reload them, when you use stateful things like an HTTP server in your plugin, you must close/deconstruct it upon `dispose`. This is called "side effect safety".

```ts
export const dispose = (ctx: Context) => {
	yourHttpServer?.dispose()
}
```

### Temporary Event Handlers

Since you cannot determine the loading order of plugins, you may find it inconvenient to "implement an event handler that processes first/last". For the former, we have "priority event handlers" (see the example code in the "Event Handlers" section), and for the latter, we can use "temporary event handlers".

Temporary event handlers have the lowest priority and are executed at the end of the response chain (and are only valid for that response chain), regardless of which plugin registered them. This makes them act as a "fallback".

```ts
ctx.on('login', async (ctx, _next) => {
	// Register a temporary event handler for this response chain
	ctx.temp!((ctx, _next) => {
		logger.warn(`Unknown host: ${ctx.host!}`)
		return {
			type: LoginResultType.KICK,
			reason: 'No route registered for this host',
		}
	})
	return _next()
})
```

The code above informs the client that "there is no available route for the current address" only when no other plugin returns a valid route (`LoginResultType.PASS`).

### Configuration Schema

Sometimes your plugin needs the user to fill in the configuration. You can use the "configuration schema" for this, and also get automatic configuration validation from Zod.

Simply export the Zod type constant `ConfigSchema` in the main program, and it will be passed into the plugin upon loading.

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
		`example plugin loaded with config: ${ctx.config.exampleString}, ${ctx.config.exampleNumberWithLimit}, ${ctx.config.exampleBooleanWithDefault}`,
	)
}
```

```yml
# config.yml
plugins:
  example:
    exampleString: ikaleio
	exampleNumberWithLimit: 42

# The output will be: example plugin loaded with config: ikaleio, 42, true
```
