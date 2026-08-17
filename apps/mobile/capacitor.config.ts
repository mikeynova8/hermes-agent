import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ignacioiacovino.mikey',
  appName: 'Mikey',
  // Build 3 is a purpose-built mobile renderer. It shares Hermes transport and
  // session contracts, not the desktop workspace/pane component graph.
  webDir: 'dist',
  backgroundColor: '#0B0D10',
  ios: {
    // No rubber-band/page scrolling of the whole WebView (app feel instead of
    // website); inner overflow containers (chat, lists) keep scrolling.
    // zoomEnabled is already default false. contentInset explicitly 'never'.
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
