/** @type {import('next').NextConfig} */

// The browser talks to the dashboard's own origin (/api/...). A route handler at
// app/api/[...path]/route.ts forwards those calls to the FastAPI backend at
// request time, so the backend URL (API_URL) is runtime config, not a build arg.
// See dashboard/.env.example.

// Next.js injects inline hydration scripts, so 'unsafe-inline' is required for
// scripts unless nonces are wired through middleware. 'unsafe-eval' is only
// needed by the dev server (HMR / eval source maps).
const isDev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// HSTS is set at the Caddy layer (production only) so local HTTP dev is not
// pinned to HTTPS by the browser.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
