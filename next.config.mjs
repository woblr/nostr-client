/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['i.stack.imgur.com', 'nostr.build', 'avatars.githubusercontent.com'],
  },
};

export default nextConfig;
