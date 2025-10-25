---
date: 2025-09-06T20:30:17.738Z
syndication:
  - https://social.coop/@caseyg/115159244841939053
updated: 2025-09-06T20:30:26.124Z
---

Made a lot of progress on my Indiekit site today: https://caseyagollan.com/posts

It wasn’t super intuitive on my first go to understand which repository structure to use from the docs. 

But looking at Paul’s site, I found that it would be better to create a separate content repository.

I also realized I should separate the "Kit" repository from the static 11ty site accessed by users. The Indiekit application is really content management and a bunch of server-side functions that deal with syndication, webmentions, etc. So I moved the 11ty logic to the main caseyagollan.com site. 

I referenced simonw’s site a bunch which is visually pretty basic but has a very thoughtful IA if you look closely at the construction of archive pages, post grouping, and display of metadata. 

I customized the post slugs because the Indiekit/11ty preset defaults didn’t match the IA from Simon which I liked. 

I also referenced Paul’s site for an example of how to configure 11ty using git submodules to load content from a separate repository. 

It's working! But the posts looked bad. Some like bookmarks were actually empty. So also added post display types based on each Indiekit post type. 

Did some more stuff that I already forgot. Will write more soon!
