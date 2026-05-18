import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';

const buildTarget = process.env.BUILD_TARGET ?? 'web';
const isDesktop = buildTarget === 'desktop';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: isDesktop ? staticAdapter({ fallback: 'index.html', strict: false }) : nodeAdapter(),
    paths: {
      base: isDesktop ? '' : (process.env.APP_BASE_PATH ?? '/besmir')
    }
  }
};

export default config;
