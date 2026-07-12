import { seedDiscoverySourcesForConfiguredUsers } from './index.js';

const results = await seedDiscoverySourcesForConfiguredUsers();
if (!results.length) {
  console.error('No configured discovery users found. Set DISCOVERY_USER_UIDS or DISCOVERY_SCAN_ALL_USERS.');
  process.exit(1);
}

for (const result of results) {
  console.log(`Seeded ${result.sourceCount} starter discovery source(s) for ${result.uid}: ${result.sourceIds.join(', ')}`);
}