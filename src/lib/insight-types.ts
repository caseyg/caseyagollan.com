export interface InsightSource {
	url: string;
	title: string;
	page_age: string | null;
	cited_text: string | null;
	/** Set on sources the owner chose to always show. */
	pinned?: boolean;
}

export interface InsightResponse {
	insight?: string;
	sources?: InsightSource[];
	recommendedTopics?: string[];
}
