import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.pablogeorge.fivethreeone',
  appName: 'WORKOUT',
  webDir: 'server/src/public',
  server: {
    url: 'https://workout.pablogeorge.org',
    cleartext: false,
    allowNavigation: ['accounts.google.com']
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
