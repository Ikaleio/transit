# Quick Start

This page will guide you on how to use Transit to proxy your Minecraft server.

## Installation

### Pre-built Binaries

We provide pre-built binaries packaged with Bun, ready to run.

Pre-built versions are available for Windows x64, Linux x64, and Linux ARM64.

[Github Release](https://github.com/Ikaleio/transit/releases/latest)

::: info
The Bun packager bundles the entire runtime and compressed source code, so the binary size may be large. However, Bun is working on optimizing the size of these build artifacts.
:::

### Installing from Source

::: tip
You need to [install Bun](https://bun.sh/docs/installation) first.
:::

```sh
git clone https://github.com/Ikaleio/transit.git
cd transit
bun install
```

### Using a Package Manager

Not yet available - we plan to upload Transit to the NPM Registry in the future.

## Running

If you're using a pre-built version: `./transit-<version>-<target>` (the name of the executable you downloaded)

::: tip
Linux users may need to grant execute permissions to Transit with the following command.

```sh
chmod +x ./transit-<version>-<target>
```

:::

If you want to run directly from source: `bun start`

On the first run, Transit should generate a default configuration file `config.yml` in the working directory.

```yml
logger:
  level: info
inbound:
  bind: 0.0.0.0:25565
  proxyProtocol: false
routes:
  - host: '*'
    destination: mc.hypixel.net
    rewriteHost: true
    proxyProtocol: false
```

This configuration file will listen on port 25565 of `0.0.0.0` (allowing LAN connections) and forward all Minecraft connections to [mc.hypixel.net](https://hypixel.net).

Open your Minecraft client, add the server `localhost:25565`, and you should see the correct motd in the server list and be able to connect to Hypixel through it.

## Next Steps

- For more details on the configuration file, refer to the [Configuration File](/config) page.
- For more details on the Transit's plugin system，refer to the [Plugin System](/plugin.md)
