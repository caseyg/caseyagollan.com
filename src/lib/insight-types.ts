export interface InsightSource {
	url: string;
	title: string;
	page_age: string | null;
	cited_text: string | null;
}

export interface InsightResponse {
	insight?: string;
	sources?: InsightSource[];
	recommendedTopics?: string[];
}
