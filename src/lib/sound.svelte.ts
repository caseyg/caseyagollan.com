import { browser } from '$app/environment';
import { play, setEnabled, setVolume, unlock, type PlayOptions, type SoundName } from 'cuelume';

/**
 * Interface sounds for the graphs and the library, synthesized by Cuelume.
 *
 * One preference for the whole site, kept in localStorage. Sound starts on,
 * except for visitors who ask their system for reduced motion: the graphs'
 * sounds accompany motion, so they start silent there and can be turned on.
 */

const KEY = 'sound';
/** Cuelume's levels are full scale; the site plays them well below that. */
const VOLUME = 0.5;
/** One gesture, one cue: a cue played this soon after another is dropped. */
const GAP_MS = 150;

function initialPreference(): boolean {
	if (!browser) return true;
	try {
		const stored = localStorage.getItem(KEY);
		if (stored) return stored === 'on';
	} catch {
		// Storage can be blocked; fall through to the system setting.
	}
	return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const preference = $state({ enabled: initialPreference() });
let configured = false;
let lastCue = -Infinity;

function configure() {
	if (configured || !browser) return;
	configured = true;
	setVolume(VOLUME);
	setEnabled(preference.enabled);
}

export const sound = {
	get enabled() {
		return preference.enabled;
	},
	/** Turn the site's sounds on or off and remember the choice. Call it from the click that asks. */
	set enabled(on: boolean) {
		configure();
		preference.enabled = on;
		try {
			localStorage.setItem(KEY, on ? 'on' : 'off');
		} catch {
			// The choice still holds for this page.
		}
		setEnabled(on);
		if (on) {
			// Start audio inside the gesture, so later cues are allowed to sound.
			void unlock().then((ready) => {
				if (ready) cue('toggle', { force: true });
			});
		}
	}
};

/**
 * Play a cue for something the visitor just did. Quiet (`subtle`) unless told otherwise.
 * Does nothing without a recent user gesture, so programmatic changes on load or from
 * the browser's history stay silent, and only the first cue of a gesture sounds.
 */
export function cue(name: SoundName, options: PlayOptions & { force?: boolean } = {}): void {
	if (!browser || !preference.enabled || document.hidden) return;
	const { force, ...playOptions } = options;
	if (!force && navigator.userActivation && !navigator.userActivation.isActive) return;
	const now = performance.now();
	if (!force && now - lastCue < GAP_MS) return;
	lastCue = now;
	configure();
	play(name, { emphasis: 'subtle', ...playOptions });
}
