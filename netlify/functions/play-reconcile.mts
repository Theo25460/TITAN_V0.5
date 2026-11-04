// Netlify compiles this TypeScript entrypoint with esbuild; the implementation stays testable as a plain module.
// Scheduled hourly (UTC). Nothing is exposed to players: Netlify invokes it, and it does nothing unless PLAY_BILLING_ENABLED=true.
export { default } from '../../functions/play-reconcile.mjs';
export const config = { schedule: '17 * * * *' };
