/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /* Palette lifted from the index.html / back.html prototypes so the
         React port keeps the same industrial dark look. */
      colors: {
        bg: { DEFAULT: '#13160f', soft: '#191d13' },
        panel: { DEFAULT: '#1d2217', raised: '#232a1c', field: '#161310' },
        line: { DEFAULT: '#36402c', strong: '#475238' },
        ink: { DEFAULT: '#e9edde', dim: '#9aa386', faint: '#6f7860' },
        brand: { DEFAULT: '#62b23a', soft: '#8fcf66', deep: '#3f8a22' },
        ember: '#e0762e',
        elec: '#46c2d6',
        steel: '#9bb0c4',
        state: { ok: '#7bc86c', warn: '#e9b53a', err: '#e8604c', pause: '#e9b53a' },
        quality: {
          special: '#46c2d6',
          superfine: '#86d36a',
          fine: '#e9b53a',
          medium: '#cf9a5e',
          drc: '#b58be0',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Roboto Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { card: '14px', field: '10px' },
      boxShadow: {
        card: '0 1px 0 rgba(54,48,36,.5) inset, 0 8px 18px -14px #000',
        sheet: '0 -10px 30px -12px #000',
      },
      keyframes: {
        pulseLed: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
        sheetUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        'pulse-led': 'pulseLed 1.7s ease-in-out infinite',
        'sheet-up': 'sheetUp .24s cubic-bezier(.2,.8,.2,1)',
      },
      screens: { xs: '400px' },
    },
  },
  plugins: [],
};
