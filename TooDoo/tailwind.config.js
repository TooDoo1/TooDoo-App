/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // https://toodoo-beta.com/ dark primary + accent blues
        blue: {
          300: '#6c9ef5',
          400: '#478beb',
          500: '#3c7fdd',
        },
        toodoo: {
          navy: '#0e1325',
          card: '#14192e',
          secondary: '#182139',
          primary: '#478beb',
          accent: '#3c7fdd',
          muted: '#6c7c9d',
        },
      },
    },
  },
  plugins: [],
};