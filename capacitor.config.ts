import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dartnest.app',
  appName: 'DartNest',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#0f172a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
  },
};

export default config;
