import './build-animation-plugins.mjs';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
await build({ root: fileURLToPath(new URL('../apps/studio', import.meta.url)), plugins: [react()] });
