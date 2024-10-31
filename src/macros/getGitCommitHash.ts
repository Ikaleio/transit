export async function getGitCommitHash() {
	return process.env.COMMIT_HASH?.toString().trim().substring(0, 7) || 'UNKNOWN'
	// 下面这个（更优的）实现会在 Windows 环境下造成 Bun 崩溃
	// 在 Bun 修好之前我们先读环境变量
	// try {
	// 	return (await Bun.$`git rev-parse HEAD`).toString().trim().substring(0, 7)
	// } catch (error) {
	// 	console.error('Error in getGitCommitHash', error)
	// 	return 'UNKNOWN'
	// }
}
