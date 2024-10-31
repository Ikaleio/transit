# 快速开始

这个页面会告诉你怎样使用 Transit 代理你的 Minecraft 服务器。

## 安装

### 预构建

使用 Bun 打包的二进制文件，可以直接运行。

我们提供 Windows x64, Linux x64 和 Linux ARM64 的预构建版本。

[Github Release](https://github.com/Ikaleio/transit/releases/latest)

::: info
Bun 打包器会将整个运行时和压缩后的源代码打包，因此二进制体积可能很大，不过 Bun 已经准备优化这些构建产物的大小了。
:::

### 从源码安装

::: tip
你需要先[安装 Bun](https://bun.sh/docs/installation)。
:::

```sh
git clone https://github.com/Ikaleio/transit.git
cd transit
bun install
```

### 使用包管理器

尚未完成 - 未来我们会将 Transit 上传到 NPM Registry。

## 运行

如果你使用预构建版本：`./transit-<version>-<target>`（你下载的可执行文件名）

::: tip
Linux 用户可能需要用以下命令给予 Transit 执行权限。

```sh
chmod +x ./transit-<version>-<target>
```

:::

如果你想直接从源码运行：`bun start`

首次启动时，Transit 应当会在工作目录下生成默认配置文件 `config.yml`。

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

该配置文件将会监听 `0.0.0.0`（允许局域网连接）的 25565 端口，将一切 Minecraft 连接转发到 [mc.hypixel.net](https://hypixel.net)。

打开你的 Minecraft 客户端，添加服务器 `localhost:25565`，你应当能在服务器列表中看到正确的 motd，并可以通过它进入 Hypixel。

## 下一步

- 想了解关于配置文件的详细信息，参阅[配置文件](/zh/config)
