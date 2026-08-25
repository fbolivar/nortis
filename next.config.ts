import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Origenes desde los que se puede abrir el servidor de desarrollo. Sin esto,
  // Next 16 bloquea los recursos del cliente cuando se accede por IP (no por
  // localhost) y la pagina no llega a hidratarse: los formularios se envian
  // como GET nativo y el login "no hace nada".
  allowedDevOrigins: [
    'localhost',
    '192.168.2.163', // consola en la LAN de pruebas
    '192.168.2.168', // equipo de pruebas
    '10.213.135.11', // interfaz secundaria
  ],

  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
  },
}

export default nextConfig
