<!-- Improved compatibility of back to top link -->

<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1 align="center">Transit</h3>
  <p align="center">
    使用 TypeScript 和 Bun 编写的 Minecraft 反向代理软件
    <br />
    <a href="https://transit.ikale.io/zh/"><strong>查看文档 »</strong></a>
    <br />
    <a href="https://github.com/Ikaleio/transit/">English</a>
    /
    <a href="https://github.com/Ikaleio/transit/blob/main/README-ZH.md">简体中文</a>
    <br />
    <br />
    <a href="https://github.com/Ikaleio/transit/issues">报告 Bug</a>
    ·
    <a href="https://github.com/Ikaleio/transit/issues">请求功能</a>
  </p>
</div>

<!-- 目录 -->
<details>
  <summary>目录</summary>
  <ol>
    <li><a href="#关于项目">关于项目</a></li>
    <li><a href="#特性">特性</a></li>
    <li><a href="#开始使用">开始使用</a></li>
    <li><a href="#使用说明">使用说明</a></li>
    <li><a href="#文档">文档</a></li>
    <li><a href="#技术栈">技术栈</a></li>
    <li><a href="#协议">协议</a></li>
  </ol>
</details>

## 关于项目

Transit 是一个高性能的 Minecraft 反向代理软件,使用 TypeScript 和 Bun 编写。它具有强大的可扩展性,支持插件系统和配置热重载。

## 特性

- 🚀 **高可靠性** - Transit 已在生产环境中部署使用
- 🔌 **插件系统** - 只需几行代码即可实现自定义白名单、踢出消息、流量控制等功能
- 💡 **开发者体验** - 支持配置文件和插件的热重载

## 开始使用

### 预构建版本

我们提供打包了 Bun 运行时的预构建二进制文件。支持:

- Windows x64
- Linux x64
- Linux ARM64

从 [Github Release](https://github.com/Ikaleio/transit/releases/latest) 下载最新版本。

### 从源码安装

1. 安装 [Bun](https://bun.sh/docs/installation)
2. 克隆仓库并安装

```sh
git clone https://github.com/Ikaleio/transit.git
cd transit
bun install
bun start
```

Transit 首次启动时会在工作目录生成配置文件 `config.yml`，并在每次启动时尝试在工作目录下 `plugins/` 目录加载插件。

## 文档

你可以在我们的[在线文档](https://transit.ikale.io/zh/)获取详细信息。

## 协议

该项目基于 MIT 协议开源 - 详见 LICENSE 文件。
