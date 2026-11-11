/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        obsidian: '#090D16',
        charcoal: '#111827',
        cyan: {
          telemetry: '#00F5D4',
        },
        violet: {
          telemetry: '#8B5CF6',
        },
        emerald: {
          telemetry: '#10B981',
        },
        amber: {
          telemetry: '#F59E0B',
        },
        crimson: {
          telemetry: '#EF4444',
        },
      },
    },
  },
  plugins: [],
};
