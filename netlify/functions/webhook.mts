// Netlify compiles this TypeScript entrypoint with esbuild. The implementation
// remains in the framework-agnostic module so it can be tested directly.
export { default } from '../../functions/webhook.mjs';
