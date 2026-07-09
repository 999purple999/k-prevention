/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Neutral, professional palette. "Ink" for text/surfaces, a single restrained accent.
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae2',
          300: '#b0bacb',
          400: '#8593ab',
          500: '#647291',
          600: '#4f5a78',
          700: '#414962',
          800: '#393f53',
          900: '#0e1220',
          950: '#080b14',
        },
        accent: {
          // Calm teal-cyan — signals "instrument", not "toy".
          50: '#ecfeff',
          100: '#cff9fe',
          200: '#a4f1fc',
          300: '#66e4f8',
          400: '#22cee9',
          500: '#08b0cf',
          600: '#088cad',
          700: '#0e708c',
          800: '#155b72',
          900: '#164b60',
          950: '#083143',
        },
        risk: {
          low: '#10b981',
          mid: '#f59e0b',
          high: '#ef4444',
        },
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.18)',
        glow: '0 0 0 1px rgb(34 206 233 / 0.15), 0 8px 32px -8px rgb(34 206 233 / 0.25)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
