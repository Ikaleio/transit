# 配置文件

这个页面详细介绍了 Transit 的配置文件语法，以及每个字段的作用。

Transit 将会在每次配置文件改变时**热重载配置文件**。该功能已经过特意设计以处理某些平台上 `fs.watch` 实现的问题，并带有防抖。

基于 Zod 的配置文件验证系统会严格检查配置文件中的一切错误，Transit 会特意将不存在的字段视为错误，以避免手滑打错字。

## 日志

该字段控制 Transit 的日志系统。

```yml
logger:
  # 显示到控制台的最低日志等级
  # 可选项为 'packet' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fetal'，严重性从低到高
  level: info
```

::: tip
将 `level` 设置为 `packet` 以查看客户端与远程服务器之间的详细流量。

这在调试连接问题时非常有用。
:::

## 入站

Transit 的工作流程为“用户 -> 入站 -> 路由 -> 出站 -> 远程服务器”。该字段控制 Transit 监听的地址和协议等。

### 链式代理

Transit 支持 [HAProxy PROXY Protocol (v2)](https://www.haproxy.org/download/1.8/doc/proxy-protocol.txt)，这意味着你可以在多个节点（用户 -> 入口 -> 中继 -> 出口 -> 远程服务器）构成的复杂代理网络上获取正确的用户 IP。

HAProxy，Gate（Lite 模式），ZBProxy 等反代应用都支持 PROXY Protocol (v2) 出/入站，因此你可以在自己的代理网络中混合使用 Transit 与这些代理程序，从而充分利用它们的低占用与 Transit 的高扩展性。

```yml
inbound:
  # Transit 监听的地址
  # 通常设置为 0.0.0.0:25565 或 127.0.0.1:25565 等
  bind: 0.0.0.0:25565
  # 是否使用 HAProxy PROXY Protocol (v2) 作为入站协议
  # 开启后将会强制使用 PROXY Protocol 入站，拒绝一切非此协议的连接
  proxyProtocol: false
```

::: warning
`inbound.bind` 不支持热重载。
:::

## 路由

该字段用于控制玩家连接到的服务器。

你可以将不同的域名解析到运行 Transit 的服务器，从而在允许玩家从单个服务器的单一端口连接到不同远程服务器。

Transit 采用**基于规则的路由**，对于每个入站连接，Transit 都会顺序匹配路由表并将连接转发到第一个匹配路由规则的远程服务器。

例如，你在 `10.0.0.2` 和 `10.0.0.3` 上部署了两个 Minecraft 服务器，分别监听 31415 和 25565 端口，并在 `10.0.0.1` 上部署了 Transit，监听 25565 端口。

这时，你可以将 `a.example.com` 与 `b.example.com` 都通过 A 记录解析到 10.0.0.1，然后写出如下配置文件。

```yml
routes:
  - host: 'a.example.com'
    destination: 10.0.0.2:31415
  - host: 'b.example.com'
    destination: 10.0.0.3 # 端口为 25565 时可省略
```

这样，玩家就可以通过 `a.example.com` 进入 `10.0.0.2:31415` 的服务器，通过 `b.example.com` 进入 `10.0.0.3:25565` 的服务器。

::: info
Transit 会正确地处理 FML 及 FML2 签名并将其转发给远程服务器。
:::

### 重写目标地址

有些服务器（例如 Hypixel）通过插件检测玩家的连入地址是否为官方提供的地址（例如 mc.hypixel.net），并拒绝连接地址错误的玩家进入服务器。

Transit 提供了 `rewriteHost` 字段绕过这个检测，它将 Minecraft 的握手包中 `host` 修改为远程服务器地址。

```yml
routes:
  - host: 'hypixel.example.com'
    destination: mc.hypixel.net
    rewriteHost: true
```

### 通配符路由

有时你可能希望从多个连接地址进入同一个服务器，又不想把路由配置复制好几份。Transit 提供了一个方便的方案应对这个问题。

路由规则的 `host` 字段提供基于 [micromatch](https://github.com/micromatch/micromatch) 的类 Bash 通配符匹配。

```yml
routes:
  # 匹配 hypixel.example.com 的任何子域名
  - host: '*.hypixel.example.com'
    destination: mc.hypixel.net
    rewriteHost: true

  # 匹配 loyisa1.example.com, loyisa3.example.com...
  # 不匹配 loyisa6.example.com
  - host: 'loyisa[1-5].example.com'
    destination: eu.loyisa.cn
    rewriteHost: true

  # 匹配所有连接地址
  - host: '*'
    destination: 127.0.0.1
```

### 链式代理

出站同样支持 HAProxy PROXY Protocol (v2)：

```yml
routes:
  - host: 'example.com'
    destination: mc.hypixel.net
    rewriteHost: true
    proxyProtocol: true
```

## 状态信息

该字段控制 Transit 对玩家返回的 motd（服务器列表中显示的信息）。

每个字段的含义相信不需要我过多解释。

```yml
motd:
  version:
    name: 'Transit'
    # Minecraft 协议版本号
    # 参见 https://wiki.vg/Protocol_version_numbers
    protocol: 47
  players:
    max: 114514
    online: 123
    # 在线玩家列表
    sample: ['Ikaleio', 'lovely_Nr']
  description: |
    §b§lTransit §6Proxy§r
    Made by §f§oIkaleio§r
  # 图标，必须是 base64 化的 64x64 PNG 图片
  favicon: 'data:image/png;base64,...'
```

::: tip
Transit 的 Minecraft 文本组件同时支持格式化字符串和 YAML 对象（Minecraft 的 JSON 格式，但是配置文件是 YAML）两种格式。格式化字符串在内部会被自动转换为 JSON 格式。

例如，下面的配置文件与上面给出的等价。

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

另外，在线玩家列表可以手动指定 UUID，但是每个玩家的 UUID 必须不重复。当传入字符串时，Transit 会自动为每个玩家生成唯一 UUID。

手动指定 UUID 的格式如下：

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

## 插件

该字段用于向插件提供配置。

```yml
plugins:
  example:
    foo: 'bar'
```
