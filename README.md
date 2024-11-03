<!-- Improved compatibility of back to top link -->

<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1 align="center">Transit</h1>
  <p align="center">
    A Minecraft reverse proxy software written in TypeScript and Bun.
    <br />
    <a href="https://transit.ikale.io/"><strong>View Documentation »</strong></a>
    <br />
    <a href="https://github.com/Ikaleio/transit/">English</a>
    /
    <a href="https://github.com/Ikaleio/transit/blob/main/README-ZH.md">简体中文</a>
    <br />
    <br />
    <a href="https://github.com/Ikaleio/transit/issues">Report Bug</a>
    ·
    <a href="https://github.com/Ikaleio/transit/issues">Request Feature</a>
  </p>
</div>

<!-- Table of Contents -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#features">Features</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#documentation">Documentation</a></li>
    <li><a href="#tech-stack">Tech Stack</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

## About The Project

Transit is a high-performance Minecraft reverse proxy software written in TypeScript and Bun. It offers powerful extensibility, supporting a plugin system and hot-reloading of configurations.

## Features

- 🚀 **High Reliability** - Transit has been deployed and used in production environments.
- 🔌 **Plugin System** - Implement custom whitelist, kick messages, traffic control, and more with just a few lines of code.
- 💡 **Developer Experience** - Supports hot-reloading of configuration files and plugins.

## Getting Started

### Prebuilt Versions

We provide prebuilt binaries packaged with the Bun runtime. Supported platforms:

- Windows x64
- Linux x64
- Linux ARM64

Download the latest version from [Github Release](https://github.com/Ikaleio/transit/releases/latest).

### Installing from Source

1. Install [Bun](https://bun.sh/docs/installation)
2. Clone the repository and install dependencies

```sh
git clone https://github.com/Ikaleio/transit.git
cd transit
bun install
bun start
```

When Transit starts for the first time, it will generate a configuration file `config.yml` in the working directory and will attempt to load plugins from the `plugins/` directory on every startup.

## Documentation

You can find detailed information in our [online documentation](https://transit.ikale.io/).

## License

This project is open-sourced under the MIT License - see the LICENSE file for details.
