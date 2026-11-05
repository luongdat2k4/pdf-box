import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'vn.alf.pdftoolbox',
  appName: 'PDF Toolbox',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'http',
    url: 'http://192.168.179.209:5173',
    cleartext: true
  },
}

export default config
