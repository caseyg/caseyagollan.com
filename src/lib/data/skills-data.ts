// Casey Gollan - Skills & Interests Data Structure

export const researchOpsSkills = [
	'ResearchOps',
	'Research Repositories',
	'Knowledge Management',
	'Minimum Viable Taxonomy',
	'Service Design for Ops',
	'Platform Interoperability',
	'Research Democratization',
	'Insight Hubs',
	'Operational Metrics',
	'Change Management',
	'Research Thinking'
];

export const technologySkills = [
	'Knowledge Graphs',
	'AI & LLMs',
	'Python',
	'Automation',
	'Data Modeling',
	'Frontend Engineering',
	'API Design',
	'Graph Databases',
	'RAG Systems',
	'Embeddings',
	'ETL Processes'
];

export const ibmSkills = [
	'Product Excellence',
	'Product-Led Growth',
	'Carbon Design System',
	'IBM Design Thinking',
	'DesignOps Guild',
	'PDLC Integration',
	'Enterprise Scale Design',
	'Internal Platforms',
	'No-Code Solutions'
];

export const aiEthicsInterests = [
	'AI Policy',
	'AI Now Institute',
	'Algorithmic Accountability',
	'Bias & Inclusion',
	'Labor & Automation',
	'Responsible AI',
	'Rights & Liberties'
];

export const educationInterests = [
	'School for Poetic Computation',
	'Poetic Computation',
	'Alternative Education',
	'Critical Theory of Technology',
	'Pedagogy',
	'Community-Based Learning',
	'Free Education Movement',
	'Transformative Justice'
];

export const artDesignSkills = [
	'Generative Art',
	'New Media Art',
	'Physical Computing',
	'Critical Making',
	'Computational Design',
	'Design Activism',
	'Networked Publishing'
];

export const openSourceInterests = [
	'Open Research Platforms',
	'Open Standards',
	'Data Portability',
	'Platform Cooperatives',
	'Commons-Based Production',
	'Anti-Monopoly Tech',
	'Digital Public Goods'
];

export const knowledgeSystemsSkills = [
	'Information Architecture',
	'Metadata Systems',
	'Library Sciences',
	'Taxonomies',
	'Controlled Vocabularies',
	'Linked Data',
	'Semantic Web',
	'Data Flows'
];

export const communityInterests = [
	'ResearchOps Community',
	'Board Member Role',
	'Cha Cha Club',
	'Democratic Management',
	'Worker Cooperatives',
	'Consensus Building',
	'Community Organizing'
];

export const activismInterests = [
	'Cooper Union Occupation',
	'Free Education Activism',
	'Transparency & Governance',
	'Education as Public Good',
	'Student Organizing',
	'Anti-Privatization'
];

export const infrastructureInterests = [
	'Infrastructure Activist',
	'Designing Dark Matter',
	'Systems Thinking',
	'Platform Strategy',
	'Second-Order Design',
	'Tools Have Pedagogies'
];

export const localFirstInterests = [
	'Local-First Software',
	'Offline-First',
	'Personal Data Stores',
	'Data Sovereignty',
	'Privacy & Data Protection',
	'User Ownership'
];

export const placesInterests = [
	'New York',
	'East Village',
	'Brooklyn',
	'Japan',
	'Sweden',
	'Finland'
];

export const toolsInterests = [
	'Obsidian',
	'Airtable',
	'Notion',
	'Zapier',
	'reMarkable',
	'Claude'
];

export const culturalInterests = [
	'Whitney Museum',
	'New Museum',
	'Museums & Galleries',
	'Media Studies',
	'Digital Art & Design'
];

// Categories
export const categories = [
	'Research Operations',
	'Technology',
	'IBM',
	'AI Ethics',
	'Education',
	'Art & Design',
	'Open Source',
	'Knowledge Systems',
	'Community',
	'Activism',
	'Infrastructure',
	'Local-First',
	'Places',
	'Tools',
	'Culture'
];

// Build all nodes
export const allNodes = [
	{ id: 'Casey', type: 'center', parent: null, selected: false },
	...categories.map((cat) => ({ id: cat, type: 'category', parent: 'Casey', selected: false })),
	...researchOpsSkills.map((skill) => ({
		id: skill,
		type: 'skill',
		parent: 'Research Operations',
		selected: false
	})),
	...technologySkills.map((skill) => ({
		id: skill,
		type: 'skill',
		parent: 'Technology',
		selected: false
	})),
	...ibmSkills.map((skill) => ({ id: skill, type: 'skill', parent: 'IBM', selected: false })),
	...knowledgeSystemsSkills.map((skill) => ({
		id: skill,
		type: 'skill',
		parent: 'Knowledge Systems',
		selected: false
	})),
	...artDesignSkills.map((skill) => ({
		id: skill,
		type: 'skill',
		parent: 'Art & Design',
		selected: false
	})),
	...aiEthicsInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'AI Ethics',
		selected: false
	})),
	...educationInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Education',
		selected: false
	})),
	...openSourceInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Open Source',
		selected: false
	})),
	...communityInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Community',
		selected: false
	})),
	...activismInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Activism',
		selected: false
	})),
	...infrastructureInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Infrastructure',
		selected: false
	})),
	...localFirstInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Local-First',
		selected: false
	})),
	...placesInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Places',
		selected: false
	})),
	...toolsInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Tools',
		selected: false
	})),
	...culturalInterests.map((interest) => ({
		id: interest,
		type: 'interest',
		parent: 'Culture',
		selected: false
	}))
];

// Create links
export const allLinks = [
	// Casey to all categories directly
	...categories.map((cat) => ({ source: 'Casey', target: cat })),

	// Category to their children
	...researchOpsSkills.map((skill) => ({ source: 'Research Operations', target: skill })),
	...technologySkills.map((skill) => ({ source: 'Technology', target: skill })),
	...ibmSkills.map((skill) => ({ source: 'IBM', target: skill })),
	...artDesignSkills.map((skill) => ({ source: 'Art & Design', target: skill })),
	...knowledgeSystemsSkills.map((skill) => ({ source: 'Knowledge Systems', target: skill })),
	...aiEthicsInterests.map((interest) => ({ source: 'AI Ethics', target: interest })),
	...educationInterests.map((interest) => ({ source: 'Education', target: interest })),
	...openSourceInterests.map((interest) => ({ source: 'Open Source', target: interest })),
	...communityInterests.map((interest) => ({ source: 'Community', target: interest })),
	...activismInterests.map((interest) => ({ source: 'Activism', target: interest })),
	...infrastructureInterests.map((interest) => ({ source: 'Infrastructure', target: interest })),
	...localFirstInterests.map((interest) => ({ source: 'Local-First', target: interest })),
	...placesInterests.map((interest) => ({ source: 'Places', target: interest })),
	...toolsInterests.map((interest) => ({ source: 'Tools', target: interest })),
	...culturalInterests.map((interest) => ({ source: 'Culture', target: interest })),

	// Cross-links between related concepts
	// Research Ops ↔ Technology
	{ source: 'Research Repositories', target: 'Knowledge Graphs' },
	{ source: 'Minimum Viable Taxonomy', target: 'Taxonomies' },
	{ source: 'Platform Interoperability', target: 'API Design' },
	{ source: 'Research Democratization', target: 'Automation' },
	{ source: 'Insight Hubs', target: 'Data Modeling' },

	// Research Ops ↔ Knowledge Systems
	{ source: 'Research Repositories', target: 'Information Architecture' },
	{ source: 'Minimum Viable Taxonomy', target: 'Controlled Vocabularies' },
	{ source: 'Research Thinking', target: 'Library Sciences' },
	{ source: 'Operational Metrics', target: 'Metadata Systems' },

	// Research Ops ↔ IBM
	{ source: 'Service Design for Ops', target: 'DesignOps Guild' },
	{ source: 'Research Democratization', target: 'Product-Led Growth' },
	{ source: 'Platform Interoperability', target: 'Internal Platforms' },
	{ source: 'Change Management', target: 'IBM Design Thinking' },

	// Technology ↔ Knowledge Systems
	{ source: 'Knowledge Graphs', target: 'Linked Data' },
	{ source: 'Graph Databases', target: 'Semantic Web' },
	{ source: 'API Design', target: 'Data Flows' },
	{ source: 'Data Modeling', target: 'Information Architecture' },

	// Technology ↔ AI Ethics
	{ source: 'AI & LLMs', target: 'AI Policy' },
	{ source: 'RAG Systems', target: 'Responsible AI' },
	{ source: 'Embeddings', target: 'Bias & Inclusion' },

	// Technology ↔ Open Source
	{ source: 'API Design', target: 'Open Standards' },
	{ source: 'Frontend Engineering', target: 'Open Source' },
	{ source: 'Data Modeling', target: 'Data Portability' },

	// IBM ↔ AI Ethics
	{ source: 'Product Excellence', target: 'Responsible AI' },
	{ source: 'Enterprise Scale Design', target: 'Algorithmic Accountability' },
	{ source: 'IBM Design Thinking', target: 'Bias & Inclusion' },

	// IBM ↔ Open Source
	{ source: 'Carbon Design System', target: 'Open Source' },
	{ source: 'Internal Platforms', target: 'Open Standards' },

	// Education ↔ Activism
	{ source: 'School for Poetic Computation', target: 'Cooper Union Occupation' },
	{ source: 'Alternative Education', target: 'Free Education Movement' },
	{ source: 'Community-Based Learning', target: 'Student Organizing' },
	{ source: 'Free Education Movement', target: 'Education as Public Good' },

	// Education ↔ Art & Design
	{ source: 'Poetic Computation', target: 'Generative Art' },
	{ source: 'Critical Theory of Technology', target: 'Critical Making' },
	{ source: 'Pedagogy', target: 'Design Activism' },

	// Art & Design ↔ Technology
	{ source: 'Generative Art', target: 'Frontend Engineering' },
	{ source: 'Physical Computing', target: 'Automation' },
	{ source: 'Computational Design', target: 'API Design' },
	{ source: 'New Media Art', target: 'Knowledge Graphs' },

	// Art & Design ↔ Culture
	{ source: 'New Media Art', target: 'Whitney Museum' },
	{ source: 'Design Activism', target: 'New Museum' },
	{ source: 'Critical Making', target: 'Media Studies' },
	{ source: 'Generative Art', target: 'Digital Art & Design' },

	// Open Source ↔ Local-First
	{ source: 'Open Research Platforms', target: 'Local-First Software' },
	{ source: 'Data Portability', target: 'Personal Data Stores' },
	{ source: 'Open Standards', target: 'Data Sovereignty' },
	{ source: 'Platform Cooperatives', target: 'Privacy & Data Protection' },

	// Open Source ↔ Community
	{ source: 'Platform Cooperatives', target: 'Worker Cooperatives' },
	{ source: 'Commons-Based Production', target: 'Democratic Management' },
	{ source: 'Digital Public Goods', target: 'Community Organizing' },

	// Open Source ↔ Infrastructure
	{ source: 'Open Research Platforms', target: 'Infrastructure Activist' },
	{ source: 'Open Standards', target: 'Platform Strategy' },
	{ source: 'Data Portability', target: 'Tools Have Pedagogies' },

	// Infrastructure ↔ Research Ops
	{ source: 'Designing Dark Matter', target: 'Research Repositories' },
	{ source: 'Platform Strategy', target: 'Platform Interoperability' },
	{ source: 'Systems Thinking', target: 'Service Design for Ops' },
	{ source: 'Tools Have Pedagogies', target: 'Research Thinking' },

	// Community ↔ Activism
	{ source: 'ResearchOps Community', target: 'Student Organizing' },
	{ source: 'Board Member Role', target: 'Transparency & Governance' },
	{ source: 'Democratic Management', target: 'Education as Public Good' },
	{ source: 'Community Organizing', target: 'Anti-Privatization' },

	// Community ↔ Education
	{ source: 'ResearchOps Community', target: 'Community-Based Learning' },
	{ source: 'Cha Cha Club', target: 'Alternative Education' },
	{ source: 'Community Organizing', target: 'Pedagogy' },

	// Tools ↔ Research Ops
	{ source: 'Obsidian', target: 'Knowledge Management' },
	{ source: 'Airtable', target: 'Research Repositories' },
	{ source: 'Notion', target: 'Insight Hubs' },
	{ source: 'Zapier', target: 'Automation' },

	// Tools ↔ Knowledge Systems
	{ source: 'Obsidian', target: 'Linked Data' },
	{ source: 'Notion', target: 'Information Architecture' },
	{ source: 'Airtable', target: 'Metadata Systems' },

	// Tools ↔ Local-First
	{ source: 'Obsidian', target: 'Local-First Software' },
	{ source: 'reMarkable', target: 'Offline-First' },
	{ source: 'Obsidian', target: 'Personal Data Stores' },

	// AI Ethics ↔ Open Source
	{ source: 'AI Policy', target: 'Digital Public Goods' },
	{ source: 'Algorithmic Accountability', target: 'Open Standards' },
	{ source: 'Responsible AI', target: 'Commons-Based Production' },

	// Places ↔ Culture
	{ source: 'New York', target: 'Whitney Museum' },
	{ source: 'East Village', target: 'New Museum' },
	{ source: 'Brooklyn', target: 'Museums & Galleries' },

	// Places ↔ Education
	{ source: 'New York', target: 'School for Poetic Computation' },
	{ source: 'East Village', target: 'Cooper Union Occupation' },
	{ source: 'Sweden', target: 'Alternative Education' },

	// Places ↔ Art & Design
	{ source: 'Japan', target: 'Computational Design' },
	{ source: 'Sweden', target: 'Design Activism' }
];

export interface Node {
	id: string;
	type: 'center' | 'category' | 'skill' | 'interest';
	parent: string | null;
	selected: boolean;
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
}

export interface Link {
	source: string | Node;
	target: string | Node;
}
