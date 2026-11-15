<script lang="ts">
	// Story decorator: shows a component at the width it gets on the page. Slot syntax is what Storybook's decorators pass.
	export let width = '100%';
</script>

<div style:max-width={width}><slot /></div>
