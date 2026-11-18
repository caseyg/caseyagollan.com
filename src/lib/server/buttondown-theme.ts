/**
 * The site's look for Casey's Buttondown pages and emails: gray ground, white type, blue actions.
 * Applied from /account by the signed-in owner (`/api/buttondown/newsletter`), which sends these
 * settings to Buttondown with the Worker's `BUTTONDOWN_API_KEY`. Edit here, merge, press Apply.
 *
 * Buttondown's hosted pages are drawn from CSS variables (`--color-*`, `--font-*`), so the web CSS
 * mostly resets those, in light and dark alike. Dagny is an Adobe Fonts kit limited to the site's
 * domains, so Buttondown's pages fall back to the system sans.
 */

const SITE = 'https://caseyagollan.com';

const colors = `
	--color-background: gray;
	--color-background-card: rgb(255 255 255 / 0.08);
	--color-background-offset: rgb(255 255 255 / 0.22);
	--color-foreground: white;
	--color-foreground-offset: rgb(255 255 255 / 0.86);
	--color-foreground-offset-2: rgb(255 255 255 / 0.68);
	--color-action: blue;
	--color-accent: blue;
	--color-error: white;
	--color-error-soft: rgb(0 0 0 / 0.18);
	--color-error-soft-border: rgb(255 255 255 / 0.5);
	--color-featured: rgb(255 255 255 / 0.08);
	--color-featured-border: rgb(255 255 255 / 0.22);
	--color-featured-icon: white;`;

export const WEB_CSS = `/* caseyagollan.com: set from the site's repo (src/lib/server/buttondown-theme.ts). */
:root,
:root.dark,
:root.supports-dark-mode {
	--font-brand: ff-dagny-web-pro, system-ui, -apple-system, sans-serif;
	--font-prose: ff-dagny-web-pro, system-ui, -apple-system, sans-serif;
	--font-accent: ff-dagny-web-pro, system-ui, -apple-system, sans-serif;
	--font-body: ff-dagny-web-pro, system-ui, -apple-system, sans-serif;
	--corner-shape: square;${colors}
	--color-background-dark: gray;
	--color-background-card-dark: rgb(255 255 255 / 0.08);
	--color-background-offset-dark: rgb(255 255 255 / 0.22);
	--color-foreground-dark: white;
	--color-foreground-offset-dark: rgb(255 255 255 / 0.86);
	--color-foreground-offset-2-dark: rgb(255 255 255 / 0.68);
	--color-action-dark: blue;
	--color-accent-dark: blue;
}
@media (prefers-color-scheme: dark) {
	:root.supports-dark-mode,
	:root.dark {${colors}
	}
}
html,
body {
	background: gray;
	color: white;
	-webkit-font-smoothing: antialiased;
}
a {
	color: white;
	text-decoration-thickness: 1px;
	text-underline-offset: 0.15em;
}
.header-navigation-link,
.header-brand-name,
button,
.button {
	letter-spacing: 0 !important;
	text-transform: none !important;
}
::selection {
	background: blue;
	color: white;
}
input[type='email'],
input[type='text'],
.archive__input {
	border: 1px solid rgb(255 255 255 / 0.5) !important;
	border-radius: 4px !important;
	background: rgb(0 0 0 / 0.18) !important;
	color: white !important;
}
input::placeholder {
	color: rgb(255 255 255 / 0.68);
}
input:focus,
button:focus-visible,
a:focus-visible {
	outline: 2px solid white;
	outline-offset: 2px;
}
button.tinted,
.button.tinted,
.archive__button {
	border: 1px solid blue !important;
	border-radius: 4px !important;
	background: blue !important;
	color: white !important;
}
button.tinted:hover,
.button.tinted:hover,
.archive__button:hover {
	border-color: rgb(73 73 255) !important;
	background: rgb(73 73 255) !important;
}
.card,
.subscription-form-fallback {
	border-color: rgb(255 255 255 / 0.22);
	border-radius: 4px;
	background: rgb(255 255 255 / 0.08);
}
`;

/** Emails keep a white ground, since many mail apps ignore dark backgrounds; blue for links. */
export const EMAIL_CSS = `/* caseyagollan.com: set from the site's repo (src/lib/server/buttondown-theme.ts). */
body,
.email-body {
	font-family: ff-dagny-web-pro, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
}
a {
	color: blue;
}
blockquote {
	margin-left: 0;
	padding-left: 1em;
	border-left: 2px solid gray;
}
`;

/**
 * Buttondown's page variables, which every plan may set: the hosted pages read them as
 * `--color-*` and `--font-*`. This alone turns the pages gray, white and blue.
 */
const translucent = (alpha: number) => `rgb(255 255 255 / ${alpha})`;
const palette = {
	'color-background': '#808080',
	'color-background-card': translucent(0.08),
	'color-background-offset': translucent(0.22),
	'color-foreground': '#ffffff',
	'color-foreground-offset': translucent(0.86),
	'color-foreground-offset-2': translucent(0.68),
	'color-accent': '#0000ff',
	'color-action': '#0000ff'
};
export const THEME_CONFIGURATION: Record<string, string> = {
	...palette,
	// The same in dark mode: the site has one look.
	...Object.fromEntries(Object.entries(palette).map(([key, value]) => [`${key}-dark`, value])),
	'color-error': '#ffffff',
	'color-error-soft': 'rgb(0 0 0 / 0.18)',
	'color-error-soft-border': translucent(0.5),
	'color-featured': translucent(0.08),
	'color-featured-border': translucent(0.22),
	'color-featured-icon': '#ffffff',
	'font-accent': 'system-ui, -apple-system, sans-serif',
	'font-body': 'system-ui, -apple-system, sans-serif',
	'corner-shape': 'square'
};

/**
 * The settings sent to Buttondown, `PATCH /v1/newsletters/{id}`, one at a time. Custom CSS
 * (`web_css`, `css`) needs a paid Buttondown plan; on a free plan Buttondown refuses those two
 * and the rest still apply. The CSS fixes what variables can't: all-caps nav, pill buttons, inputs.
 */
export const NEWSLETTER_THEME = {
	archive_theme: 'modern',
	theme_configuration: THEME_CONFIGURATION,
	web_css: WEB_CSS,
	css: EMAIL_CSS,
	tint_color: '#0000ff',
	// After signing up, and after confirming, readers land back on the site's posts.
	subscription_redirect_url: `${SITE}/posts?subscribe=subscribed`,
	subscription_confirmation_redirect_url: `${SITE}/posts?subscribe=confirmed`
} as const;

export type NewsletterTheme = typeof NEWSLETTER_THEME;
