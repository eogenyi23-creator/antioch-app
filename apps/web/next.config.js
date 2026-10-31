/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@antioch/shared', '@antioch/escrow-client'],
};
module.exports = nextConfig;
