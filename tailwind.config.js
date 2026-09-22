/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],

  safelist: [
    {
      pattern:
        /(bg|text|border|ring)-(brand|neutral)-(primary|secondary|light|accent|100|300|700|900)/,
    },
  ],

  theme: {
    extend: {
      colors: {
        brand: {
          primary: "rgb(var(--brand-primary) / <alpha-value>)",
          secondary: "rgb(var(--brand-secondary) / <alpha-value>)",
          light: "rgb(var(--brand-light) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
        },
        neutral: {
          900: "rgb(var(--neutral-900) / <alpha-value>)",
          700: "rgb(var(--neutral-700) / <alpha-value>)",
          300: "rgb(var(--neutral-300) / <alpha-value>)",
          100: "rgb(var(--neutral-100) / <alpha-value>)",
          white: "rgb(var(--neutral-white) / <alpha-value>)",
        },
      },

      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },

      fontFamily: {
        primary: ["var(--font-primary)"],
      },

      transitionDuration: {
        fast: "var(--motion-fast)",
        normal: "var(--motion-normal)",
      },
    },
  },

  plugins: [],
};
