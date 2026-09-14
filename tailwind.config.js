/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        polar: {
          950: '#070a0e',
          900: '#0b0f14',
          850: '#0f1720',
          800: '#141e2b',
          700: '#1e2d40',
          600: '#2b3f58',
        },
        frost: {
          DEFAULT: '#38bdf8',
          glow: '#06b6d4',
          light: '#e0f2fe',
        },
        hazard: {
          crimson: '#ef4444',
          darkRed: '#991b1b',
          amber: '#f59e0b',
        },
        thing: {
          blood: '#7f1d1d',
          vein: '#b91c1c',
          toxic: '#a3e635',
        }
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flame': 'flame 1.5s ease-in-out infinite alternate',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        flame: {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(1.08)', opacity: '1', filter: 'drop-shadow(0 0 15px rgba(239, 68, 68, 0.7))' },
        },
        glow: {
          '0%': { filter: 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.4))' },
          '100%': { filter: 'drop-shadow(0 0 18px rgba(56, 189, 248, 0.8))' },
        }
      }
    },
  },
  plugins: [],
};
