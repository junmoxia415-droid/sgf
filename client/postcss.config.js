import autoprefixer from 'autoprefixer';
import tailwindCompat from 'tailwindcss-compat';

export default {
  plugins: process.env.SGF_WEB_TARGET === 'compat'
    ? [tailwindCompat({ config: './tailwind.config.js' }), autoprefixer()]
    : [],
};
