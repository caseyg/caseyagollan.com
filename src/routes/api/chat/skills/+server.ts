import type { RequestHandler } from './$types';
import { parseSkillFile, type Skill } from '$lib/chat-skills';
import { chatViewer } from '$lib/server/chat/identity';
import { acceptProposal, deleteSkill, dismissProposal, getProposal, getSkill, listSkills, proposeAllFromSource, saveSkill, searchRegistry, setSkillEnabled, SkillError } from '$lib/server/chat/skills';

export const prerender = false;

const PRIVATE = { 'cache-control': 'private, no-store' };
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE });

/**
 * Casey's chat skills, for the manager on /account, the composer's slash menu and the review
 * card in the chat. Every call needs the owner's own session; anyone else gets a 404.
 *
 * This is the only way a skill is added, changed or removed. The chat's assistant can put one
 * up for review (`skill_add`), but adding it is a POST from Casey's browser.
 */
async function owner(request: Request, platform: App.Platform | undefined) {
	const env = (platform?.env ?? {}) as NonNullable<App.Platform['env']>;
	const viewer = await chatViewer(request, env).catch(() => null);
	return viewer?.owner ? env : null;
}

const failed = (error: unknown) => {
	if (error instanceof SkillError) return answer({ error: error.message }, 400);
	console.warn(JSON.stringify({ event: 'chat_skills_api_failed', detail: String((error as Error)?.message ?? error).slice(0, 200) }));
	return answer({ error: 'That didn’t work. Try again.' }, 500);
};

export const GET: RequestHandler = async ({ request, platform, url }) => {
	const env = await owner(request, platform);
	if (!env) return answer({ error: 'Not found' }, 404);
	const bucket = env.PUBLISHING_STATE;
	try {
		// One skill whole, for editing or exporting.
		const name = url.searchParams.get('name');
		if (name !== null) { const skill = await getSkill(bucket, name); return skill ? answer({ skill }) : answer({ error: 'That skill isn’t there any more.' }, 404); }
		// A skill waiting for review, whole.
		const pending = url.searchParams.get('pending');
		if (pending !== null) {
			const proposal = await getProposal(bucket, pending);
			if (proposal) return answer({ proposal });
			// Gone: added already (Casey has a skill of the name the card shows), or dismissed or stale.
			const named = url.searchParams.get('named');
			return answer({ error: 'This is no longer waiting to be added.', added: !!(named && await getSkill(bucket, named)) }, 404);
		}
		// Search skills.sh.
		const find = url.searchParams.get('find');
		if (find !== null) return answer({ results: await searchRegistry(find.slice(0, 100)) });
		return answer({ skills: await listSkills(bucket) });
	} catch (error) { return failed(error); }
};

type Body = { action?: unknown; name?: unknown; enabled?: unknown; pending?: unknown; source?: unknown; file?: unknown; previous?: unknown; skill?: Partial<Skill> };

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const env = await owner(request, platform);
	if (!env) return answer({ error: 'Not found' }, 404);
	// Only this site's own pages may change skills, whatever cookies a browser sends along.
	if (request.headers.get('origin') !== url.origin || !/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return answer({ error: 'Not allowed.' }, 403);
	const body = (await request.json().catch(() => null)) as Body | null;
	const bucket = env.PUBLISHING_STATE;
	const name = typeof body?.name === 'string' ? body.name : '';
	try {
		switch (body?.action) {
			// Written or edited by Casey on /account. `file` is an uploaded SKILL.md, read here so the form shows what would be kept.
			case 'save': return answer({ skill: await saveSkill(bucket, body.skill ?? {}, { previous: typeof body.previous === 'string' ? body.previous : undefined }) });
			case 'read': return answer({ skill: parseSkillFile(String(body.file ?? '').slice(0, 300_000)) });
			case 'enable': await setSkillEnabled(bucket, name, body.enabled === true); return answer({ ok: true });
			case 'delete': await deleteSkill(bucket, name); return answer({ ok: true });
			// From skills.sh or GitHub: one skill, or all of a repository's or marketplace's, fetched and set aside for Casey to read, then added by id.
			case 'fetch': return answer(await proposeAllFromSource(bucket, String(body.source ?? '').slice(0, 500)));
			case 'add': return answer({ skill: await acceptProposal(bucket, String(body.pending ?? '')) });
			case 'dismiss': await dismissProposal(bucket, String(body.pending ?? '')); return answer({ ok: true });
			default: return answer({ error: 'Unknown action.' }, 400);
		}
	} catch (error) { return failed(error); }
};
