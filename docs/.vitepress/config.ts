import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'Transit',
	description:
		'Minecraft reverse proxy software written with TypeScript and Bun.',
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: 'Home', link: '/' },
			{ text: 'Config', link: '/config' },
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
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/Ikaleio/transit' },
		],
	},
	locales: {
		root: {
			label: 'English',
			lang: 'en',
		},
		zh: {
			label: '简体中文',
			lang: 'zh',
		},
	},
})
