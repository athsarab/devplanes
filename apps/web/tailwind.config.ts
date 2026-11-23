import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          400: "#947bff",
          500: "#7354f6",
        },
        cyan: "#348b97",
      },
    },
  },
  plugins: [],
} satisfies Config;
