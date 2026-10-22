/**
 * Site identity, set at build time. The domain isn't chosen yet: set SITE_URL
 * (and SITE_NAME) in the Cloudflare Pages environment and redeploy to move
 * every canonical link, the sitemap and social previews to it.
 */
export const SITE_URL = (process.env.SITE_URL || 'https://idaho-child-support-calc.pages.dev').replace(/\/+$/, '');
export const SITE_NAME = process.env.SITE_NAME || 'Idaho Child Support Calculator';
export const APP_PATH = '/app/';
