/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        cyber: {
          bg: '#060814',
          panel: '#0d1226',
          border: '#1e294b',
          cyan: '#00f0ff',
          purple: '#a855f7',
          pink: '#ec4899',
          emerald: '#10b981',
          amber: '#f59e0b',
          red: '#ef4444',
        },
      },
      boxShadow: {
        'neon-cyan': '0 0 18px rgba(0, 240, 255, 0.35)',
        'neon-purple': '0 0 18px rgba(168, 85, 247, 0.35)',
        'neon-emerald': '0 0 18px rgba(16, 185, 129, 0.35)',
      },
    },
  },
  plugins: [],
};
