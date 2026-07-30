/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pp: {
          orange:    '#ff4b12',
          orangeDark:'#d93a08',
          orangeLite:'#fff1ec',
          orangeMid: '#ffc0ac',
          sidebar:   '#1f0d08',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
}