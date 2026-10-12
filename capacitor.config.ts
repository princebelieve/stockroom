import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.stockroom.business',
  appName: 'Stockroom Business',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
}

export default config
