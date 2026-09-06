/** @type {import('next').NextConfig} */

// The browser talks to the dashboard's own origin (/api/...). A route handler at
// app/api/[...path]/route.ts forwards those calls to the FastAPI backend at
// request time, so the backend URL (API_URL) is runtime config, not a build arg.
// See dashboard/.env.example.

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
