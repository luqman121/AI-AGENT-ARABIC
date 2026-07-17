import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0e0e15",
    description: "اوصف ما تحتاجه بالعربي، ووكيل ينجزه لك.",
    dir: "rtl",
    display: "standalone",
    icons: [
      { purpose: "any", sizes: "192x192", src: "/icons/icon-192.png", type: "image/png" },
      { purpose: "any", sizes: "512x512", src: "/icons/icon-512.png", type: "image/png" },
      {
        purpose: "maskable",
        sizes: "192x192",
        src: "/icons/icon-maskable-192.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/icons/icon-maskable-512.png",
        type: "image/png",
      },
    ],
    id: "/",
    lang: "ar",
    name: "وكيل",
    short_name: "وكيل",
    start_url: "/",
    theme_color: "#0e0e15",
  };
}
