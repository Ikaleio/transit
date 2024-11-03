import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'Transit',
	description:
		'Minecraft reverse proxy software written with TypeScript and Bun.',
	head: [['script', { src: '/_vercel/insights/script.js', defer: 'true' }]],

	locales: {
		root: {
			label: 'English',
			lang: 'en',
			themeConfig: {
				nav: [
					{ text: 'Home', link: '/' },
					{ text: 'Config', link: '/config' },
					{ text: 'Plugin', link: '/plugin' },
				],
				sidebar: [
					{
						text: 'Start',
						items: [{ text: 'Quick Start', link: '/quick-start' }],
					},
					{
						text: 'Config Reference',
						items: [{ text: 'Config Schema', link: '/config' }],
					},
					{
						text: 'Plugin Reference',
						items: [{ text: 'Plugin System', link: '/plugin' }],
					},
				],
				socialLinks: [
					{ icon: 'github', link: 'https://github.com/Ikaleio/transit' },
				],
			},
		},
		zh: {
			label: '简体中文',
			lang: 'zh',
			themeConfig: {
				nav: [
					{ text: '首页', link: '/zh/' },
					{ text: '配置', link: '/zh/config' },
					{ text: '插件', link: '/zh/plugin' },
				],
				sidebar: [
					{
						text: '开始',
						items: [{ text: '快速开始', link: '/zh/quick-start' }],
					},
					{
						text: '配置参考',
						items: [{ text: '配置模式', link: '/zh/config' }],
					},
					{
						text: '插件参考',
						items: [{ text: '插件系统', link: '/zh/plugin' }],
					},
				],
				socialLinks: [
					{ icon: 'github', link: 'https://github.com/Ikaleio/transit' },
				],
			},
		},
	},
})
