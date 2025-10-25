---
date: 2025-09-29T11:48:12.606-04:00
title: 'Stupid question: As consensus builds around the rejection of "AI slop" aesthetic, is it only a matter of time before models are re-trained to write in the style of "Not AI"?'
category: AI
visibility: public
syndication:
  - https://social.coop/@caseyg/115288369067246270
  - https://bsky.app/profile/did:plc:s3fw2giksymfvruno3tvem4k/post/3lzyechv4sp2e
updated: 2025-09-29T11:48:25.580-04:00
---

Wikipedia has an excellent and fascinating page on [Signs of AI Writing](https://en.m.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), which [qualify a page for "speedy deletion"](https://www.404media.co/wikipedia-editors-adopt-speedy-deletion-policy-for-ai-slop-articles/) instead of requiring the community to waste their time deliberating the merits of obvious AI slop.

![](https://caseyagollan.com/media/photos/2025/09/29/screenshot-2025-09-29-at-11-07-31a-am.png)

One of my favorite (and maybe lesser known?) capabilities of Claude is the option to define and change [Styles](https://www.anthropic.com/news/styles).

This is probably a bad idea, but my first thought was just to drop the URL of Wikipedia's guide into Claude and asked it to create a system prompt for avoiding AI-style writing. 

Notably, it failed to fetch Wikipedia! Probably because of bot blocking due to [AI crawlers straining Wikipedia's servers](https://www.engadget.com/ai/wikipedia-is-struggling-with-voracious-ai-bot-crawlers-121546854.html).

![](https://caseyagollan.com/media/photos/2025/09/29/screenshot-2025-09-29-at-11-14-35a-am.png)

Claude attempted to gather the content some other way, but I stopped it and just pasted in the text from the page I already had open.

Here's the "Not AI" system prompt I got back:

> Based on the Wikipedia page about AI writing patterns, here's a system prompt designed to help avoid these telltale signs:
> 
> ---
> 
> ## Writing Style Instructions
> 
> Write in a natural, varied style that reflects genuine human communication. Focus on clarity and specificity rather than rhetorical flourishes.
> 
> ### Core Principles
> 
> **Be specific, not symbolic.** State facts directly without inflating their importance. Instead of "stands as a testament to innovation," write "introduced a new approach." Avoid describing everything as vital, crucial, captivating, or significant.
> 
> **Use concrete details.** Replace generic praise with specific information. Rather than "revolutionary titan of industry," write "invented a train-coupling device." Ground your writing in observable facts.
> 
> **Vary your writing patterns.** Mix short and long sentences naturally. Avoid rigid structures like constant three-part lists or parallel constructions. Let the content determine the structure, not a formula.
> 
> ### What to Avoid
> 
> - Starting responses with praise ("Great question!") or collaborative language ("Certainly!", "I'd be happy to...")
> - Promotional language (breathtaking, must-see, nestled, vibrant tapestry, rich heritage)
> - Unnecessary analysis tags (highlighting, emphasizing, underscoring, reflecting)
> - Section conclusions that restate the main idea
> - "Not only... but also" constructions and "It's not just X, it's Y" patterns
> - Attribution to vague authorities (some experts say, observers note, industry reports suggest)
> - Overuse of transition phrases at the beginning of paragraphs
> - Excessive boldface for emphasis or lists with bolded headers
> - Em dashes where commas or parentheses would work better
> - Future speculation sections about challenges and prospects
> 
> ### What to Do Instead
> 
> Write with genuine voice and natural variation. Use formatting only when it truly aids comprehension. Support claims with specific sources or acknowledge uncertainty. End sections where the information naturally concludes rather than adding summaries.
> 
> When discussing any topic, present information neutrally without inserting editorial comments about importance or significance. If something is truly important, the facts themselves will convey this.
> 
> Choose simple, direct language over inflated vocabulary. Write "affects" not "impacts," "problem" not "challenge," "helps" not "enhances." Let strong facts speak for themselves without rhetorical amplification.
> 
> Remember: Good writing sounds like a knowledgeable person explaining something clearly, not like a press release or academic abstract. Focus on being informative and precise rather than impressive or comprehensive.

I added this to Claude as a new style called "Not AI":

![](https://caseyagollan.com/media/photos/2025/09/29/screenshot-2025-09-29-at-11-22-48a-am.png)

And then I prompted Claude to "Write 3 paragraphs about Wikipedia".

Here's Claude's response without any style applied (the default). The slop is evident before even getting to the end of the first sentence. 🤣 

> Wikipedia stands as one of the most remarkable achievements of the internet age, fundamentally transforming how people access and share knowledge. 

I mean, it's not _wrong_. But it is melodramatic! Wikipedia is mauybe a tricky example here because it is a legitimate societal achievement deserving of waxing poetic. Claude continues:

> Launched in January 2001 by Jimmy Wales and Larry Sanger, this free online encyclopedia emerged from an earlier project called Nupedia and quickly grew beyond anyone's expectations. The name itself combines "wiki," a Hawaiian word meaning "quick," with "encyclopedia," perfectly capturing its essence as a rapidly evolving repository of human knowledge. Today, Wikipedia exists in over 300 languages and contains millions of articles, making it one of the most visited websites globally and the largest reference work in human history.
> 
> The revolutionary aspect of Wikipedia lies in its collaborative model, where anyone with internet access can contribute, edit, and improve articles. This radical departure from traditional encyclopedia creation relies on a community of volunteers who write, fact-check, and maintain content according to core principles like neutrality, verifiability, and the use of reliable sources. 

Tells here: "revolutionary", "radical". Again, true! And also trademark slop.

> The platform operates on MediaWiki software and follows a complex governance structure with administrators, editors, and various dispute resolution mechanisms. While this open model has faced criticism regarding accuracy and vandalism, numerous studies have shown Wikipedia's reliability to be comparable to traditional encyclopedias, particularly for scientific topics, thanks to its active community of editors who quickly correct errors and update information.
> 
> Wikipedia's impact extends far beyond being merely a reference tool, as it has democratized access to information on an unprecedented scale and influenced how we think about knowledge creation and sharing in the digital age. The encyclopedia serves as a crucial resource for students, researchers, journalists, and curious individuals worldwide, particularly in regions where traditional educational resources may be limited. Its nonprofit parent organization, the Wikimedia Foundation, maintains the platform through donations, ensuring it remains free and advertisement-free. Despite ongoing challenges including systemic bias, editor retention, and coverage gaps in certain topics and languages, Wikipedia continues to evolve and adapt, representing a unique experiment in collective intelligence and the power of collaborative knowledge creation.

OK! Here's the same prompt but with the "Not AI" style enabled:

> Wikipedia launched in January 2001 when Jimmy Wales and Larry Sanger created it as a free, openly editable encyclopedia. The site grew from a few hundred articles in its first year to over 60 million articles across more than 300 languages today. Unlike traditional encyclopedias that relied on paid experts, Wikipedia allowed anyone with internet access to write and edit articles, a radical departure from how reference works had been created for centuries.

OK first ding here is for "radical" 🤣 but in this case, it feels better placed as a callout of a specific differentiator rather than just another embellishment in a list of embellishments.

> The site runs on a wiki software platform called MediaWiki, which tracks every edit made to every article. Volunteer editors follow five core principles: Wikipedia should maintain a neutral point of view, be verifiable through reliable sources, contain no original research, respect copyright, and follow behavioral guidelines for civil interaction. These volunteers range from subject matter experts contributing to their fields to students fixing typos they spot while doing homework. The Wikimedia Foundation, a nonprofit organization based in San Francisco, maintains the servers and employs about 700 staff members, though the actual content creation and moderation comes from roughly 120,000 active volunteer editors worldwide.
> 
> Wikipedia has become one of the most visited websites globally, receiving around 15 billion page views per month. Studies have found its accuracy comparable to traditional encyclopedias for many topics, though coverage depth varies significantly by subject. Medical and scientific articles tend to be thoroughly sourced and regularly updated, while articles about local businesses or recent events might contain errors or lack citations. The site operates entirely on donations, refusing to run advertisements despite the potential for billions in revenue, and makes all its content freely available under Creative Commons licensing.

Overall better! More concise and just plain — in a good way. So is the guidance given by Wikipedia just ... good advice for writing in general?

And (stupid question) as consensus builds around the rejection of "AI slop" aesthetic, is it only a matter of time before models are re-trained to write in the style of "Not AI"?
