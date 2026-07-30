/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
       * These point at the CSS variables rather than repeating their values.
       *
       * That is what lets one class mean two things in the two rooms of this
       * app: the shop floor is light, the back office is dark, and a component
       * shared between them - the modal, the table, the spinner - says
       * `text-ink-dim` once and gets whichever is right for where it is
       * rendered. A literal hex here would have pinned it to one of them and
       * broken it in the other.
       *
       * `brand` carries an rgb triplet as well, because Tailwind can only
       * apply an opacity modifier (`ring-brand/20`) to a channel list.
       */
      colors: {
        bg: { DEFAULT: 'var(--bg)', soft: 'var(--bg2)' },
        panel: { DEFAULT: 'var(--panel)', raised: 'var(--panel2)', field: 'var(--sunken)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line2)' },
        ink: { DEFAULT: 'var(--ink)', dim: 'var(--ink-dim)', faint: 'var(--ink-faint)' },
        brand: {
          DEFAULT: 'rgb(var(--brand-rgb) / <alpha-value>)',
          soft: 'var(--brand-soft)',
          deep: 'var(--brand-deep)',
          on: 'var(--on-fill)',
        },
        ember: 'var(--ember)',
        elec: 'var(--elec)',
        steel: 'var(--steel)',
        state: {
          ok: 'var(--ok)',
          warn: 'var(--warn)',
          err: 'var(--err)',
          pause: 'var(--pause)',
        },
        quality: {
          special: 'var(--q-special)',
          superfine: 'var(--q-superfine)',
          fine: 'var(--q-fine)',
          medium: 'var(--q-medium)',
          coarse: 'var(--q-coarse)',
          drc: 'var(--q-drc)',
          sillsheet: 'var(--q-sillsheet)',
          on: 'var(--on-fill)',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Roboto Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { card: '14px', field: '10px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        sheet: 'var(--shadow-sheet)',
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
