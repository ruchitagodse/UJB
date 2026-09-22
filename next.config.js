/** @type {import('next').NextConfig} */
module.exports = {
  allowedDevOrigins: ['192.168.1.60'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
};
