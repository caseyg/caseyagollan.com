<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import Nav from "$lib/components/Nav.svelte";
    import SkillsGraph from "$lib/components/SkillsGraph.svelte";
    import PersistentDocument from "$lib/components/PersistentDocument.svelte";
    import InsightCard from "$lib/components/InsightCard.svelte";

    interface Insight {
        topic: string;
        insight: string;
        timestamp: number;
        isStreaming?: boolean;
        isThinking?: boolean;
        sources?: Array<{ url: string; title: string; page_age: string | null; cited_text: string | null }>;
        recommendedTopics?: string[];
    }

    let textContainer: HTMLElement;
    let documentContent: string = $state(
        "Casey is a Senior Manager of Engineering in IBM's Product Excellence Office, leading a team that builds AI productivity platforms for hundreds of product teams across one of the largest and oldest technology companies.\n\nPreviously, he co-founded the School for Poetic Computation and led operations at NYU's AI Now Institute. He serves on the ResearchOps Community board and is a member of ChaCha Club.",
    );
    let isDocumentUpdating: boolean = $state(false);
    let isDocumentAnimating: boolean = $state(false);
    let currentEditEvent: { old_text: string; new_text: string } | undefined =
        $state(undefined);
    let insights: Insight[] = $state([]);
    let insightsByTopic: Map<string, Insight> = $state(new Map());
    let activeInsightTopic: string | null = $state(null);
    let graphFocusNodeId: string | null = $state(null);
    let clickedTopics: Set<string> = $state(new Set());

    // Document update queue
    interface QueuedUpdate {
        topic: string;
        insight: string;
    }
    let updateQueue: QueuedUpdate[] = [];
    let isProcessingQueue = false;

    async function processDocumentUpdateQueue() {
        if (isProcessingQueue || updateQueue.length === 0) {
            return;
        }

        isProcessingQueue = true;
        isDocumentUpdating = true;

        // Collect all queued updates and clear the queue
        const updates = [...updateQueue];
        updateQueue = [];

        try {
            // Combine all insights into a single update request
            const combinedInsight = updates
                .map((u) => `${u.topic}: ${u.insight}`)
                .join("\n\n");
            const topics = updates.map((u) => u.topic).join(", ");

            // Add new topics to clicked topics set
            updates.forEach((u) => clickedTopics.add(u.topic));

            const docResponse = await fetch("/api/update-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: topics,
                    insight: combinedInsight,
                    currentDocument: documentContent,
                    clickedTopics: Array.from(clickedTopics),
                }),
            });

            if (!docResponse.ok) {
                const errorData = await docResponse.json();
                console.error("Failed to update document:", errorData);
                // Re-queue failed updates
                updateQueue.push(...updates);
                isDocumentUpdating = false;
                isProcessingQueue = false;
                return;
            }

            // Handle streaming document updates (both cached and fresh)
            const docReader = docResponse.body?.getReader();
            const docDecoder = new TextDecoder();

            if (docReader) {
                let buffer = "";
                while (true) {
                    const { done, value } = await docReader.read();
                    if (done) break;

                    buffer += docDecoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");

                    // Keep last incomplete line in buffer
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const docData = JSON.parse(line.slice(6));

                                if (docData.type === "edit") {
                                    // Trigger diff animation if this is a str_replace command
                                    if (
                                        docData.command === "str_replace" &&
                                        docData.old_text &&
                                        docData.new_text
                                    ) {
                                        currentEditEvent = {
                                            old_text: docData.old_text,
                                            new_text: docData.new_text,
                                        };
                                        // Clear the edit event after a short delay to allow animation to start
                                        setTimeout(() => {
                                            currentEditEvent = undefined;
                                        }, 100);
                                    }
                                } else if (docData.type === "document_update") {
                                    // Don't update documentContent here - let the animation handle it
                                    // We'll update it in the 'done' event instead
                                } else if (docData.type === "done") {
                                    documentContent = docData.document;
                                    // Only clear updating flag if animation is complete
                                    if (!isDocumentAnimating) {
                                        isDocumentUpdating = false;
                                    }
                                } else if (docData.type === "error") {
                                    console.error(
                                        "Document update error:",
                                        docData.error,
                                    );
                                    isDocumentUpdating = false;
                                }
                            } catch (e) {
                                console.error(
                                    "Error parsing document update:",
                                    e,
                                );
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error processing document update queue:", error);
            // Re-queue failed updates
            updateQueue.push(...updates);
            isDocumentUpdating = false;
        } finally {
            isProcessingQueue = false;

            // Process next batch if more updates were queued
            if (updateQueue.length > 0) {
                setTimeout(() => processDocumentUpdateQueue(), 100);
            }
        }
    }

    function queueDocumentUpdate(topic: string, insight: string) {
        updateQueue.push({ topic, insight });

        // Start processing if not already in progress
        if (!isProcessingQueue) {
            processDocumentUpdateQueue();
        }
    }

    function handleAnimationStateChange(animating: boolean) {
        isDocumentAnimating = animating;
        // When animation completes, clear the updating flag
        if (!animating) {
            isDocumentUpdating = false;
        }
    }

    const telescopicContent = `
- 👋 Hi, I'm
- Casey!
  - Casey!
    - Casey
    - A.
      - Alexander
    - Gollan!
  - I
  - lead
    - lead a team
    - building
      - building AI productivity platforms
    - at
    - IBM.
      - IBM, serving hundreds of product teams across one of the largest and oldest technology companies, as Senior Manager of Engineering in the Product Excellence Office.
  - 💼 🤖 👨‍🎨 📚.
    - 💼 in my career,
      - 💼 My path to engineering leadership has taken me through
      - research operations,
        - research operations (building systems for knowledge management and team enablement),
      - platform engineering,
        - platform engineering (developing internal tools teams actually adopt),
      - and
      - leadership.
        - leadership (managing teams, strategy, and cross-functional collaboration).
      - Some highlights:
      - IBM,
        - at IBM since 2021, I've built the User Insights Hub (1,000+ research reports), the Winning Products Dashboard, and a Productivity Assistant using multi-agent orchestration,
      - NYU,
        - leading operations at New York University's AI Now Institute (AI ethics research),
      - SFPC,
        - co-founding the School for Poetic Computation (an art school for technologists),
      - and
      - ResearchOps.
        - serving on the board of the ResearchOps Community (18,000+ practitioners).
    - 🤖 on AI,
      - 🤖 I work on AI platforms that help product managers with
      - research synthesis,
        - research synthesis (processing user feedback at scale),
      - ideas triage,
        - ideas triage (clustering and prioritizing feature requests),
      - and
      - competitive analysis.
        - competitive analysis (understanding market positioning).
      - I'm interested in
      - agents,
        - multi-agent orchestration and MCP implementations,
      - open platforms,
        - open infrastructure and interoperable systems,
      - and
      - local-first.
        - local-first, decentralized, and indieweb approaches to software.
    - 👨‍🎨 as an artist and educator,
      - 👨‍🎨 In my work as an artist and educator, I've
      - taught,
        - taught at The Cooper Union,
      - exhibited,
        - exhibited at the Whitney Biennial,
      - been awarded a fellowship,
        - been awarded a fellowship at The New School's Center for Art and Politics,
      - and lectured.
        - and lectured at Yale University and Between Bridges Galerie in Berlin.
    - 📚 and as a student.
      - 📚 I've studied
      - art and design,
        - art and design at The Cooper Union (where I received my Bachelor of Fine Arts),
      - and...
        - cooperatives,
          - Platform Cooperatives Now with Mondragon University and The New School,
        - and...
          - sociocracy,
            - The Theory and Practice of Sociocracy in Cooperatives with Sociocracy For All,
          - and...
            - decentralized organizing,
              - Patterns for Decentralized Organizing with The Hum,
            - and...
              - democratic management,
                - Democratic Management Skills with The Democracy at Work Institute,
              - and...
                - design ops,
                  - DesignOps: Scaling UX Design and User Research with Nielsen Norman Group,
                - and...
                  - people management,
                    - People Management Intensive with Anne Libby,
                  - and...
                    - and I am still always looking to learn something new.
  - Based in
  - NYC.
    - NYC, building things that bridge technical and business stakeholders.
  - Here's how to
  - reach me.
    - reach me by
    - email,
      - email at hello@caseyagollan.com,
    - or
    - linkedin.
      - linkedin.com/in/casey-gollan.
  - 🪨 * p.s.
    - 🪨 * p.s. About the rocks. These are the
    - "Monument to Finnish Sisu". 🇫🇮
      - "Monument to Finnish Sisu". 🇫🇮
      - As an anonymous internet user once asked, on a now defunct blogspot:
        - "What is so compelling about this pile of rocks that would inspire me to look at this picture so many times on any given day?"
          - Sisu is a word from the Finnish language that is
          - "ekphrastically untranslatable".
            - "ekphrastically untranslatable".
            - (This means that there isn't a word quite like it in the English language.)
              - It stands for a combination of resilience, determination, making a plan and sticking to it, and continuing on against the odds.
                - It stands for a combination of resilience, determination, making a plan and sticking to it, and continuing on against the odds. It has often been described as similar to "grit" or "equanimity" but — I love this part — with a "grimmer quality of stress management."
`;

    onMount(() => {
        if (browser) {
            // Load telescopic text library as a script
            const script = document.createElement("script");
            script.src = "https://unpkg.com/telescopic-text@1.2.4/lib/index.js";
            script.onload = () => {
                try {
                    // @ts-ignore - accessing global telescopic text library
                    const { createTelescopicTextFromBulletedList } =
                        window.telescopicText || window;
                    // Clear any SSR fallback content
                    textContainer.innerHTML = "";
                    const node =
                        createTelescopicTextFromBulletedList(telescopicContent);
                    textContainer.appendChild(node);
                } catch (error) {
                    console.error(
                        "Failed to initialize telescopic text:",
                        error,
                    );
                }
            };
            script.onerror = () => {
                console.error("Failed to load telescopic text script");
            };
            document.head.appendChild(script);
        }
    });

    async function handleTopicClick(topic: string | null) {
        if (!topic) {
            // Clear selection
            activeInsightTopic = null;
            return;
        }

        // Check if we already have an insight for this topic
        const existingInsight = insightsByTopic.get(topic);

        if (existingInsight && !existingInsight.isStreaming) {
            activeInsightTopic = topic;
            // Scroll to the insight card
            scrollToInsightCard(topic);
            return;
        }

        try {
            // Create placeholder insight card immediately
            const placeholderInsight: Insight = {
                topic,
                insight: "",
                timestamp: Date.now(),
                isStreaming: true,
                isThinking: true,
            };

            // Add to insights list and cache
            insightsByTopic.set(topic, placeholderInsight);
            // Add new insight at the beginning, keep first 10
            insights = [
                placeholderInsight,
                ...insights.filter((i) => i.topic !== topic),
            ].slice(0, 10);
            activeInsightTopic = topic;

            // Scroll to the new insight card after it's added to DOM
            setTimeout(() => scrollToInsightCard(topic), 100);

            // Generate new insight (non-streaming)
            const insightResponse = await fetch("/api/generate-insight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic }),
            });

            if (!insightResponse.ok) {
                console.error(
                    "Insight response not ok:",
                    insightResponse.status,
                    insightResponse.statusText,
                );
                try {
                    const errorData = await insightResponse.json();
                    console.error("Error data:", errorData);
                    if (errorData.error === "Claude API key not configured") {
                        // Show helpful message about the topic without AI
                        if (!documentContent.includes("**Note:**")) {
                            documentContent = `# Casey Gollan\n\n*An AI-generated profile emerging from interactive exploration of his work and interests.*\n\n**Note:** To enable AI-generated insights, add your Claude API key to \`.env\`:\n\`\`\`\nANTHROPIC_API_KEY=your_api_key_here\n\`\`\`\n\nGet your API key from [Anthropic Console](https://console.anthropic.com/).\n\n## Recently explored:\n- ${topic}\n`;
                        } else if (!documentContent.includes(`- ${topic}`)) {
                            documentContent += `- ${topic}\n`;
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse error response:", e);
                }
                // Remove placeholder on error
                insights = insights.filter((i) => i.topic !== topic);
                insightsByTopic.delete(topic);
                return;
            }

            // Parse JSON response
            const data = await insightResponse.json();
            console.log('📦 Received insight data:', data);

            // Update insight with the results
            const currentInsight = insightsByTopic.get(topic);
            if (currentInsight) {
                currentInsight.isStreaming = false;
                currentInsight.isThinking = false;
                currentInsight.insight = data.insight || "";
                currentInsight.sources = data.sources || [];
                currentInsight.recommendedTopics = data.recommendedTopics || [];

                // Update the insight in the array to trigger reactivity
                const index = insights.findIndex((i) => i.topic === topic);
                if (index !== -1) {
                    insights[index] = { ...currentInsight };
                    insights = insights;
                }

                // Trigger reactivity for the Map by creating a new instance
                insightsByTopic = new Map(insightsByTopic);

                // Queue document update
                queueDocumentUpdate(topic, data.insight);
            }
        } catch (error) {
            console.error("Error handling topic click:", error);
            // Remove placeholder on error
            insights = insights.filter((i) => i.topic !== topic);
            insightsByTopic.delete(topic);
            isDocumentUpdating = false;
        }
    }

    // Handle clicking on an insight card
    function handleInsightCardClick(topic: string) {
        activeInsightTopic = topic;
        // Focus the graph on this node
        graphFocusNodeId = topic;
        // Scroll to the insight card
        scrollToInsightCard(topic);
    }

    // Scroll the insights container to show the card for a given topic
    function scrollToInsightCard(topic: string) {
        if (browser) {
            // Find the insight card element by its topic
            const insightIndex = insights.findIndex((i) => i.topic === topic);
            if (insightIndex !== -1) {
                const container = document.querySelector(
                    ".insights-container",
                ) as HTMLElement;
                const cards = container?.querySelectorAll(".insight-item");
                const card = cards?.[insightIndex] as HTMLElement;

                if (card && container) {
                    // Calculate the scroll position to center the card
                    const containerRect = container.getBoundingClientRect();
                    const cardRect = card.getBoundingClientRect();
                    const scrollLeft =
                        card.offsetLeft -
                        containerRect.width / 2 +
                        cardRect.width / 2;

                    // Scroll only the container, not the page
                    container.scrollTo({
                        left: scrollLeft,
                        behavior: "smooth",
                    });
                }
            }
        }
    }
</script>

<svelte:head>
    <title>👋 Hi, I'm Casey Gollan!</title>
    <meta
        name="description"
        content="Senior Manager of Engineering at IBM, building AI productivity platforms. Previously co-founded the School for Poetic Computation."
    />
    <meta property="og:title" content="👋 Hi, I'm Casey Gollan!" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://caseyagollan.com" />
    <meta property="og:image" content="https://caseyagollan.com/sisu.gif" />
    <meta name="theme-color" content="#0000ff" />
    <link
        href="https://unpkg.com/telescopic-text@1.2.4/lib/index.css"
        rel="stylesheet"
    />
    <link rel="micropub" href="https://kit.caseyagollan.com/micropub" />
    <link
        rel="authorization_endpoint"
        href="https://kit.caseyagollan.com/auth"
    />
    <link rel="token_endpoint" href="https://kit.caseyagollan.com/auth/token" />
    <link
        rel="webmention"
        href="https://webmention.io/caseyagollan.com/webmention"
    />
    <link rel="feed" href="/posts/" type="text/html" title="All Posts" />
    <link
        rel="alternate"
        type="application/atom+xml"
        title="Casey Gollan - All Posts"
        href="/feed.xml"
    />
    <script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-YX0XVKSRCH"
    ></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag() {
            dataLayer.push(arguments);
        }
        gtag("js", new Date());
        gtag("config", "G-YX0XVKSRCH");
    </script>
</svelte:head>

<header>
    <a class="skip-link" href="/index-accessible.html"
        >Visit Accessible Alternative</a
    >
</header>

<Nav currentPage="home" />

<main bind:this={textContainer}>
    {#if !browser}
        <p>
            👋 Hi, I'm Casey! I lead a team building AI productivity platforms at
            IBM 💼 🤖 👨‍🎨 📚. Based in NYC.
        </p>
    {/if}
</main>

<img
    src="/sisu.gif"
    alt="Monument to Finnish Sisu. Rocks are arranged into a large mound at the edge of a grassy plateau, overlooking fields, forests, and lakes, under a bright cloudy sky."
/>

<div class="info-sections">
    <div class="two-column-section">
        <section class="info-section">
            <h2>Currently</h2>
            <p>
                I'm a Senior Manager of Engineering in IBM's Product Excellence
                Office, leading a team that builds AI productivity platforms for
                hundreds of product teams across one of the largest and oldest
                technology companies. Our focus: helping PMs and designers
                spend less time on synthesis work and more time on strategy.
                Recently shipped: agents for product teams, a dashboard tracking
                70+ product strategy metrics, and a research library connecting
                1,000+ UX insights to roadmaps.
            </p>
            <p>
                I serve on the board of the global ResearchOps Community
                (18,000+ practitioners) and am a member of ChaCha Club. Before
                IBM, I co-founded the School for Poetic Computation and led
                operations at NYU's AI Now Institute.
            </p>
            <p>
                Outside work: knowledge gardening in Obsidian, writing personal
                software, reading about alternative organizing and technology
                critique.
            </p>
        </section>

        <section class="info-section">
            <h2>Exploring</h2>
            <ul>
                <li>
                    <strong>Enterprise-scale AI design and deployment</strong> —
                    Shipping agents, dashboards, and integrations within IBM. Building
                    a deeper understanding of the unique affordances, possibilities,
                    and limitations of applied AI with each release.
                </li>
                <li>
                    <strong>Open platforms</strong> — Writing and speaking about
                    the need for interoperable systems in enterprise product development.
                    Keeping an eye on platforms that prioritize data ownership, integration,
                    and extensibility over vendor lock-in.
                </li>
                <li>
                    <strong
                        >Local-first, decentralized, and indieweb software</strong
                    > — Using Obsidian for local-first knowledge mangement and IndieKit
                    for social publishing and catchement. Prototyping Otso, a set
                    of tools for greater data ownership and agency. Always interested
                    in trying opinionated new software.
                </li>
                <li>
                    <strong>Operations as design</strong> — Advocating for the (often)
                    invisible "work behind the work": building the systems, culture,
                    and practices that set teams up for success at scale. Researching
                    organizational design and politics across large and old institutions.
                </li>
            </ul>
        </section>
    </div>

    <section class="info-section skills-section">
        <div class="three-pane-container">
            <div class="graph-document-container">
                <div class="graph-and-insights">
                    <SkillsGraph
                        onTopicClick={handleTopicClick}
                        bind:focusNodeId={graphFocusNodeId}
                        insightsData={insightsByTopic}
                    />
                </div>
                <div class="bio-sticky-container" class:updating={isDocumentUpdating}>
                    <PersistentDocument
                        content={documentContent}
                        isUpdating={isDocumentUpdating}
                        editEvent={currentEditEvent}
                        onAnimationStateChange={handleAnimationStateChange}
                    />
                </div>
            </div>
            {#if insights.length > 0}
                <div class="insights-container">
                    {#each insights as insight (insight.timestamp)}
                        <InsightCard
                            topic={insight.topic}
                            insight={insight.insight}
                            active={activeInsightTopic === insight.topic}
                            isStreaming={insight.isStreaming}
                            isThinking={insight.isThinking}
                            sources={insight.sources}
                            onclick={() =>
                                handleInsightCardClick(insight.topic)}
                        />
                    {/each}
                </div>
            {/if}
        </div>
    </section>
</div>

<a rel="me" href="https://social.coop/@caseyg" class="hidden"
    >@caseyg@social.coop</a
>

<style>
    :global(html) {
        background: gray;
    }

    :global(body) {
        background: gray;
        color: white;
        font-family: ff-dagny-web-pro, sans-serif;
        font-size: 5vw;
        font-weight: 100;
        line-height: 1.5;
        margin: 0;
    }

    :global(:root) {
        --telescope-text-color: white !important;
        --telescope-highlight: blue !important;
        --telescope-highlight-hover: rgb(73, 73, 255) !important;
    }

    .skip-link {
        background: blue;
        color: white;
        font-weight: 700;
        left: 0;
        position: absolute;
        top: 0;
        transform: translateY(-100%);
    }

    .skip-link:focus {
        transform: translateY(0%);
    }

    main {
        max-width: 1400px;
        margin: 3rem auto 0;
        padding: 0 2rem;
    }

    img {
        width: 50vw;
        max-width: 1400px;
        margin: 3rem auto;
        padding: 0 2rem;
        display: block;
    }

    .hidden {
        display: none;
    }

    .info-sections {
        max-width: 1400px;
        margin: 3rem auto;
        padding: 0 2rem;
        font-size: 1.125rem;
        font-weight: 300;
        line-height: 1.6;
    }

    .two-column-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3rem;
        margin-bottom: 3rem;
    }

    .three-pane-container {
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        overflow: hidden;
    }

    .graph-document-container {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 0;
        align-items: stretch;
        min-height: 600px;
    }

    .skills-section {
        position: relative;
    }

    .graph-and-insights {
        min-width: 0;
        border-right: 1px solid rgba(255, 255, 255, 0.2);
        padding: 1.5rem;
    }

    .bio-sticky-container {
        padding: 1.5rem;
        min-height: 600px;
        transition: box-shadow 0.6s ease;
        border-radius: 4px;
    }

    .bio-sticky-container.updating {
        box-shadow: inset 0 0 30px rgba(73, 73, 255, 0.3);
        animation: glowPulse 2s ease-in-out infinite;
    }

    @keyframes glowPulse {
        0%, 100% {
            box-shadow: inset 0 0 30px rgba(73, 73, 255, 0.2);
        }
        50% {
            box-shadow: inset 0 0 50px rgba(73, 73, 255, 0.5);
        }
    }

    .insights-container {
        display: flex;
        gap: 0.75rem;
        overflow-x: auto;
        overflow-y: visible;
        scroll-behavior: smooth;
        padding: 1.5rem;
        padding-top: 120px;
        align-items: flex-end;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
    }

    .insights-container :global(.insight-item) {
        flex: 0 0 200px;
        min-width: 200px;
        height: 120px;
        animation: slideInFromLeft 0.4s ease;
        transition: all 0.3s ease;
        position: relative;
    }

    .insights-container :global(.insight-item:hover) {
        height: 120px;
        z-index: 10;
    }

    .insights-container :global(.insight-item:hover::before) {
        content: "";
        position: absolute;
        bottom: 0;
        left: 0;
        width: 320px;
        height: 400px;
        pointer-events: none;
    }

    @keyframes slideInFromLeft {
        from {
            opacity: 0;
            transform: translateX(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    .info-section {
        margin-bottom: 3rem;
    }

    .two-column-section .info-section {
        margin-bottom: 0;
    }

    .info-section h2 {
        font-size: 1.75rem;
        font-weight: 400;
        margin-bottom: 1rem;
        color: white;
        line-height: 1.3;
    }

    .info-section p {
        margin-bottom: 1rem;
    }

    .info-section ul {
        list-style: none;
        padding: 0;
    }

    .info-section li {
        margin-bottom: 0.5rem;
    }

    @media (max-width: 1200px) {
        .graph-document-container {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 900px) {
        .info-sections {
            max-width: 90vw;
            font-size: 1rem;
        }

        .info-section h2 {
            font-size: 1.5rem;
        }

        .two-column-section {
            grid-template-columns: 1fr;
            gap: 0;
        }

        .two-column-section .info-section {
            margin-bottom: 3rem;
        }
    }
</style>
