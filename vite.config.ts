import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const soapUrl = env.VITE_READVIEW_URL
  const proxy: Record<string, string | ProxyOptions> = {}

  if (soapUrl) {
    const targetUrl = new URL(soapUrl)
    const target = `${targetUrl.protocol}//${targetUrl.host}`
    const targetPath = targetUrl.pathname

    proxy['/soap'] = {
      target,
      changeOrigin: true,
      secure: false,
      rewrite: (path: string) => path.replace(/^\/soap/, targetPath),
    }
  }

  return {
    plugins: [react()],
    server: {
      proxy,
    },
  }
})
