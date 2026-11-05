import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'vn.alf.pdftoolbox',
  appName: 'PDF Toolbox',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
