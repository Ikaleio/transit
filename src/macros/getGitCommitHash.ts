export function getGitCommitHash() {
	try {
		const { stdout } = Bun.spawnSync({
			cmd: ['git', 'rev-parse', 'HEAD'],
			stdout: 'pipe',
		})

		return stdout.toString().trim().substring(0, 7)
	} catch (error) {
		console.error('Error in getGitCommitHash', error)
		return 'UNKNOWN'
	}
}
