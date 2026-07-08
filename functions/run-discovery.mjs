import { runDiscoveryForConfiguredUsers } from './index.js';

const scanType = process.env.DISCOVERY_SCAN_TYPE || process.argv[2] || 'full';
await runDiscoveryForConfiguredUsers(scanType === 'quick' ? 'quick' : 'full');