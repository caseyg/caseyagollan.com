import { describe, expect, test } from 'bun:test';
import { NO_VIEW, RemoteCanvas } from '../src/lib/server/chat/remote-canvas';

describe('a table canvas reached by asking, not by socket', () => {
	test('with no view open, a change is refused with what to do', async () => {
		await expect(new RemoteCanvas().perform({ op: 'read' })).rejects.toThrow(NO_VIEW);
	});

	test('a change waits for the view, which is given it, makes it and reports', async () => {
		const canvas = new RemoteCanvas();
		canvas.attach('a');
		const asked = canvas.next('a', 1000);
		const change = canvas.perform({ op: 'select', ids: ['x'] });
		const turn = await asked;
		expect('op' in turn && turn.op).toMatchObject({ type: 'table:op', op: 'select', ids: ['x'] });
		canvas.done('a', { id: ('op' in turn && turn.op!.id) as string, ok: true, result: { selected: 1 } });
		expect(await change).toEqual({ selected: 1 });
		// Given once only.
		expect(await canvas.next('a', 0)).toEqual({});
	});

	test('a change already waiting is handed over at once, and an error the view reports is thrown', async () => {
		const canvas = new RemoteCanvas();
		canvas.attach('a');
		const change = canvas.perform({ op: 'remove', ids: ['gone'] });
		const turn = await canvas.next('a', 1000) as { op: { id: string } };
		canvas.done('a', { id: turn.op.id, ok: false, error: 'None of those ids are on the table.' });
		await expect(change).rejects.toThrow('None of those ids');
	});

	test('a newer view takes over, and the older one is told so even while it waits', async () => {
		const canvas = new RemoteCanvas();
		canvas.attach('old');
		const waiting = canvas.next('old', 5000);
		canvas.attach('new');
		expect(await waiting).toEqual({ replaced: true });
		expect(await canvas.next('old', 0)).toEqual({ replaced: true });
		const change = canvas.perform({ op: 'read' });
		const turn = await canvas.next('new', 0) as { op: { id: string } };
		canvas.done('old', { id: turn.op.id, ok: true, result: 'from the old view' });
		canvas.done('new', { id: turn.op.id, ok: true, result: 'from the new view' });
		expect(await change).toBe('from the new view');
	});

	test('a view that stopped asking counts as closed', async () => {
		let now = 0;
		const canvas = new RemoteCanvas(() => now);
		canvas.attach('a');
		expect(canvas.open()).toBe(true);
		now = 60_000;
		expect(canvas.open()).toBe(false);
		await expect(canvas.perform({ op: 'read' })).rejects.toThrow(NO_VIEW);
	});
});
