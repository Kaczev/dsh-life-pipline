import { createRequire } from 'node:module';

// Native require survives DSH's CommonJS/ESM cache eviction on hot reload (#537).
const require = createRequire(import.meta.url);
export default require('qrcode');
