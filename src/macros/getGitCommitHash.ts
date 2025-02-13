export async function getGitCommitHash() {
	try {
		return (await Bun.$`git rev-parse HEAD`).toString().trim().substring(0, 7)
	} catch (error) {
		console.error('Error in getGitCommitHash', error)
		return 'UNKNOWN'
	}
}
