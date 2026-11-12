export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutoRestart } = await import('./lib/auto-restart')
    startAutoRestart()
  }
}
