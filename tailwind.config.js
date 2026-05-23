/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4ff',
          100: '#dce6ff',
          200: '#b9cfff',
          300: '#84acff',
          400: '#527eff',
          500: '#2d55f7',
          600: '#1e3aed',
          700: '#1e3a8a',
          800: '#1e3060',
          900: '#0f172a',
          950: '#0a0f1e',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
