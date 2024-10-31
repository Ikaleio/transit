# Configuration File

This page provides a detailed explanation of the syntax of the Transit configuration file and the purpose of each field.

Transit will **hot-reload the configuration file** every time it is changed. This feature is specifically designed to handle issues with `fs.watch` implementations on certain platforms and includes debouncing.

The configuration file validation system, based on Zod, strictly checks for any errors in the configuration file. Transit treats non-existent fields as errors to avoid typos.

## Logging

This field controls the logging system in Transit.

```yml
logger:
  # The minimum log level to display in the console
  # Available options are 'packet' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fetal', with severity from low to high
  level: info
```

::: tip
Set `level` to `packet` to view detailed traffic between the client and the remote server.

This is very useful for debugging connection issues.
:::

## Inbound

Transit’s workflow is "User -> Inbound -> Routing -> Outbound -> Remote Server." This field controls the address and protocol that Transit listens on.

### Chained Proxies

Transit supports the [HAProxy PROXY Protocol (v2)](https://www.haproxy.org/download/1.8/doc/proxy-protocol.txt), which means you can retrieve the correct user IP across a complex proxy network consisting of multiple nodes (User -> Entry -> Relay -> Exit -> Remote Server).

Reverse proxy applications like HAProxy, Gate (Lite mode), and ZBProxy support PROXY Protocol (v2) for both inbound and outbound connections. You can mix and match Transit with these proxy programs in your own proxy network, leveraging their low resource usage and Transit’s high extensibility.

```yml
inbound:
  # The address Transit listens on
  # Typically set to 0.0.0.0:25565 or 127.0.0.1:25565, etc.
  bind: 0.0.0.0:25565
  # Whether to use HAProxy PROXY Protocol (v2) for inbound connections
  # When enabled, it will enforce PROXY Protocol for inbound connections, rejecting any non-PROXY Protocol connections
  proxyProtocol: false
```

::: warning
`inbound.bind` does not support hot-reloading.
:::

## Routing

This field controls which server players are connected to.

You can map different domain names to the server running Transit, allowing players to connect to different remote servers from a single server's port.

Transit uses **rule-based routing**. For each inbound connection, Transit matches the routing table in order and forwards the connection to the first remote server that matches a routing rule.

For example, if you have two Minecraft servers deployed at `10.0.0.2` and `10.0.0.3`, listening on ports 31415 and 25565 respectively, and you have Transit deployed on `10.0.0.1`, listening on port 25565.

You can map `a.example.com` and `b.example.com` to `10.0.0.1` via A records, and then write the following configuration file.

```yml
routes:
  - host: 'a.example.com'
    destination: 10.0.0.2:31415
  - host: 'b.example.com'
    destination: 10.0.0.3 # Port 25565 can be omitted
```

This way, players can connect to the server at `10.0.0.2:31415` via `a.example.com` and to the server at `10.0.0.3:25565` via `b.example.com`.

::: info
Transit correctly handles FML and FML2 signatures and forwards them to the remote server.
:::

### Rewriting the Target Address

Some servers (like Hypixel) use plugins to check whether the player's connection address is the official one (e.g., mc.hypixel.net) and reject players connecting with an incorrect address.

Transit provides the `rewriteHost` field to bypass this check by modifying the `host` in the Minecraft handshake packet to match the remote server address.

```yml
routes:
  - host: 'hypixel.example.com'
    destination: mc.hypixel.net
    rewriteHost: true
```

### Wildcard Routing

Sometimes, you may want to route multiple connection addresses to the same server without duplicating the routing configuration. Transit provides a convenient solution for this.

The `host` field in routing rules supports Bash-like wildcard matching based on [micromatch](https://github.com/micromatch/micromatch).

```yml
routes:
  # Matches any subdomain of hypixel.example.com
  - host: '*.hypixel.example.com'
    destination: mc.hypixel.net
    rewriteHost: true

  # Matches loyisa1.example.com, loyisa3.example.com...
  # Does not match loyisa6.example.com
  - host: 'loyisa[1-5].example.com'
    destination: eu.loyisa.cn
    rewriteHost: true

  # Matches all connection addresses
  - host: '*'
    destination: 127.0.0.1
```

### Chained Proxies

Outbound connections also support HAProxy PROXY Protocol (v2):

```yml
routes:
  - host: 'example.com'
    destination: mc.hypixel.net
    rewriteHost: true
    proxyProtocol: true
```

## Status Information

This field controls the motd (message of the day) returned to players (the information displayed in the server list).

I believe the meaning of each field doesn’t need much explanation.

```yml
motd:
  version:
    name: 'Transit'
    # Minecraft protocol version number
    # See https://wiki.vg/Protocol_version_numbers
    protocol: 47
  players:
    max: 114514
    online: 123
    # Online player list
    sample: ['Ikaleio', 'lovely_Nr']
  description: |
    §b§lTransit §6Proxy§r
    Made by §f§oIkaleio§r
  # Icon, must be a base64-encoded 64x64 PNG image
  favicon: 'data:image/png;base64,...'
```

::: tip
Transit supports both formatted strings and YAML objects (Minecraft’s JSON format, but written in YAML) for Minecraft text components. Formatted strings are automatically converted to JSON format internally.

For example, the following configuration file is equivalent to the one above.

```yml
motd:
  version:
    name: 'Transit'
    protocol: 47
  players:
    max: 114514
    online: 123
    sample: ['Ikaleio', 'lovely_Nr']
  description:
    text: ''
    extra:
      - text: 'Transit '
        color: aqua
        bold: true
      - text: Proxy
        color: gold
        bold: true
      - text: "\nMade by "
      - text: Ikaleio
        color: white
        bold: true
      - text: "\n"
```

Additionally, the online player list can manually specify UUIDs, but each player’s UUID must be unique. When passing strings, Transit will automatically generate a unique UUID for each player.

The format for manually specifying UUIDs is as follows:

```yml
motd:
  players:
    sample:
      - name: Ikaleio
        id: dd0bad7c-c9a2-4d5f-ad3a-9754cdd3146a
      - name: lovely_Nr
        id: aaa67d3a-0864-420c-8c79-5a185a2cbc2b
```

:::

## Plugins

This field is used to provide configuration to plugins.

```yml
plugins:
  example:
    foo: 'bar'
```
