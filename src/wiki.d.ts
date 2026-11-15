declare module 'virtual:wiki-vault' {
	const vault: import('$lib/wiki/types').WikiVault;
	export default vault;
}

declare module 'virtual:wiki-manifest' {
	const manifest: import('$lib/wiki/types').WikiManifest;
	export default manifest;
}
