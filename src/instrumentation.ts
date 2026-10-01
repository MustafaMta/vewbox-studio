/** Next.js calls `register` once when the server starts: run migrations and seed before the first request. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrap } = await import('./server/bootstrap');
    await bootstrap();
  }
}
