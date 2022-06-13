Using [WebAIM's WCAG 2 Checklist](https://webaim.org/standards/wcag/checklist)

## Guideline 1.1

### Text Alternatives: Provide text alternatives for any non-text content

#### [1.1.1 Non-text Content (Level A)](https://www.w3.org/TR/WCAG21/#non-text-content)

- [X] ~~*All images, form image buttons, and image map hot spots have appropriate, equivalent alternative text.*~~ [2022-06-13]
- [X] ~~*Images that do not convey content, are decorative, or contain content that is already conveyed in text are given null alt text (alt="") or implemented as CSS backgrounds. All linked images have descriptive alternative text.*~~ [2022-06-13]
- [X] ~~*Equivalent alternatives to complex images are provided in context or on a separate linked page.*~~ [2022-06-13]
- [ ] Form buttons have a descriptive value.
- [ ] Form inputs have associated text labels.
- [ ] Embedded multimedia is identified via accessible text.
- [ ] Frames and iframes are appropriately titled.

## Guideline 1.2

### Time-based Media: Provide alternatives for time-based media

#### [1.2.1 Prerecorded Audio-only and Video-only (Level A)](https://www.w3.org/TR/WCAG21/#audio-only-and-video-only-prerecorded)

- [ ] A descriptive text transcript that includes relevant auditory content is provided for non-live audio-only (audio podcasts, MP3 files, etc.).
- [ ] A descriptive text transcript or audio description is provided for non-live video-only (e.g., video that has no audio track), unless the video is decorative.

#### [1.2.2 Captions (Prerecorded) (Level A)](https://www.w3.org/TR/WCAG21/#captions-prerecorded)

- [ ] Synchronized captions are provided for non-live video (YouTube videos, etc.).

#### [1.2.3 Audio Description or Media Alternative (Prerecorded) (Level A)](https://www.w3.org/TR/WCAG21/#audio-description-or-media-alternative-prerecorded)

- [ ] A descriptive text transcript OR audio description track is provided for non-live video. NOTE: Only required if the video conveys content visually that is not presented via the audio track.

### [1.2.4 Captions (Live) (Level AA)](https://www.w3.org/TR/WCAG21/#captions-live)

- [ ] Synchronized captions are provided for all live multimedia that contains audio (audio-only broadcasts, web casts, video conferences, etc.)

#### [1.2.5 Audio Description (Prerecorded) (Level AA)](https://www.w3.org/TR/WCAG21/#audio-description-prerecorded)

- [ ] Audio descriptions are provided for all video content. NOTE: Only required if the video conveys content visually that is not presented via the audio track.
- [ ] While not required at level AA, WebAIM recommends descriptive transcripts instead of or in addition to audio descriptions for optimal accessibility.

#### [1.2.6 Sign Language (Prerecorded) (Level AAA)](https://www.w3.org/TR/WCAG21/#sign-language-prerecorded)

- [ ] A sign language video is provided for all media content that contains audio.

#### [1.2.7 Extended Audio Description (Prerecorded) (Level AAA)](https://www.w3.org/TR/WCAG21/#extended-audio-description-prerecorded)

- [ ] When audio description cannot be added to video due to audio timing (e.g., insufficient pauses in the audio), an alternative version of the video with pauses that allow audio descriptions is provided.

#### [1.2.8 Media Alternative (Prerecorded) (Level AAA)](https://www.w3.org/TR/WCAG21/#media-alternative-prerecorded)

- [ ] A descriptive text transcript is provided for all pre-recorded media that has a video track. For optimal accessibility, WebAIM strongly recommends transcripts for all multimedia content.

#### [1.2.9 Audio-only (Live) (Level AAA)](https://www.w3.org/TR/WCAG21/#audio-only-live)

- [ ] A descriptive text transcript (e.g., the script of the live audio) is provided for all live content that has audio.

## Guideline 1.3

### Adaptable: Create content that can be presented in different ways (for example simpler layout) without losing information or structure

#### [1.3.1 Info and Relationships (Level A)](https://www.w3.org/TR/WCAG21/#info-and-relationships)

- [ ] Semantic markup is used to designate headings (`<h1>`), regions/landmarks, lists (`<ul>`, `<ol>`, and `<dl>`), emphasized or special text (`<strong>`, `<code>`, `<abbr>`, `<blockquote>`, for example), etc. Semantic markup is used appropriately.
  - **Hmm the plugin renders a bunch of `<span>` elements. I wonder if it could be rendered as nested `<ul>` elements instead (mirroring the meaningfulness of the editor syntax!), and the link words could be `<a>` with meaningful titles**
- [ ] Tables are used for tabular data and data cells are associated with their headers. Data table captions, if present, are associated to data tables.
- [ ] Text labels are associated with form input elements. Related form elements are grouped with fieldset/legend. ARIA labelling may be used when standard HTML is insufficient.

#### [1.3.2 Meaningful Sequence (Level A)](https://www.w3.org/TR/WCAG21/#meaningful-sequence)

- [ ] The reading and navigation order (determined by code order) is logical and intuitive.

#### [1.3.3 Sensory Characteristics (Level A)](https://www.w3.org/TR/WCAG21/#sensory-characteristics)

- [ ] Instructions do not rely upon shape, size, or visual location (e.g., "Click the square icon to continue" or "Instructions are in the right-hand column").
- [ ] Instructions do not rely upon sound (e.g., "A beeping sound indicates you may continue.").

#### [1.3.4 Orientation (WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#orientation)

- [X] ~~*Orientation of web content is not restricted to only portrait or landscape, unless a specific orientation is necessary.*~~ [2022-06-13]

#### [1.3.5 Identify Input Purpose (WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#identify-input-purpose)

- [ ] Input fields that collect certain types of user information have an appropriate autocomplete attribute defined.

#### [1.3.6 Identify Purpose (WCAG 2.1 Level AAA)](https://www.w3.org/TR/WCAG21/#identify-purpose)

- [X] ~~*HTML5 regions or ARIA landmarks are used to identify page regions.*~~ [2022-06-13]
- [ ] ARIA is used, where appropriate, to enhance HTML semantics to better identify the purpose of interface components.

## Guideline 1.4

### Distinguishable: Make it easier for users to see and hear content including separating foreground from background

#### [1.4.1 Use of Color (Level A)](https://www.w3.org/TR/WCAG21/#use-of-color)

- [X] ~~*Color is not used as the sole method of conveying content or distinguishing visual elements.*~~ [2022-06-13]
- [X] ~~*Color alone is not used to distinguish links from surrounding text unless the contrast ratio between the link and the surrounding text is at least 3:1 and an additional distinction (e.g., it becomes underlined) is provided when the link is hovered over and receives focus.*~~ [2022-06-13]

#### [1.4.2 Audio Control (Level A)](https://www.w3.org/TR/WCAG21/#audio-control)

- [ ] A mechanism is provided to stop, pause, mute, or adjust volume for audio that automatically plays on a page for more than 3 seconds.

#### [1.4.3 Contrast (Minimum) (Level AA)](https://www.w3.org/TR/WCAG21/#contrast-minimum)

- [ ] Text and images of text have a contrast ratio of at least 4.5:1.
  - https://webaim.org/resources/contrastchecker/
  - [ ] White on Gray = 3.84:1
    - Passes AA but only for large text
    - Fails AAA for large text
    - Fails AA and AAA for all text
  - [ ] White on Blue = 8.59:1
    - Passes all
  - [ ] Blue on Gray = 2.23:1
    - Fails all
- [ ] Large text - at least 18 point (typically 24px) or 14 point (typically 18.66px) and bold - has a contrast ratio of at least 3:1.

#### [1.4.4 Resize text (Level AA)](https://www.w3.org/TR/WCAG21/#resize-text)

- [ ] The page is readable and functional when the page is zoomed to 200%. NOTE: 1.4.10 (below) introduces a much higher requirement for zoomed content.
  - **Setting text size with VW might interfere with this!**

#### [1.4.5 Images of Text (Level AA)](https://www.w3.org/TR/WCAG21/#images-of-text)

- [X] ~~*If the same visual presentation can be made using text alone, an image is not used to present that text.*~~ [2022-06-13]

#### [1.4.6 Contrast (Enhanced) (Level AAA)](https://www.w3.org/TR/WCAG21/#contrast-enhanced)

- [ ] Text and images of text have a contrast ratio of at least 7:1.
- [ ] Large text - at least 18 point (typically 24px) or 14 point (typically 18.66px) bold - has a contrast ratio of at least 4.5:1.

#### [1.4.7 Low or No Background Audio (Level AAA)](https://www.w3.org/TR/WCAG21/#low-or-no-background-audio)

- [ ] Audio with speech has no or very low background noise so the speech is easily distinguished.

#### [1.4.8 Visual Presentation (Level AAA)](https://www.w3.org/TR/WCAG21/#visual-presentation)

- [X] ~~*Blocks of text over one sentence in length:*~~ [2022-06-13]
      Are no more than 80 characters wide.
      Are NOT fully justified (aligned to both the left and the right margins).
      Have adequate line spacing (at least 1/2 the height of the text) and paragraph spacing (1.5 times line spacing).
      Have a specified foreground and background color. These can be applied to specific elements or to the entire page using CSS (and thus inherited by all other elements).
      Do NOT require horizontal scrolling when the text size is doubled.
- [X] ~~*Are no more than 80 characters wide.*~~ [2022-06-13]
- [X] ~~*Are NOT fully justified (aligned to both the left and the right margins).*~~ [2022-06-13]
- [X] ~~*Have adequate line spacing (at least 1/2 the height of the text) and paragraph spacing (1.5 times line spacing).*~~ [2022-06-13]
- [X] ~~*Have a specified foreground and background color. These can be applied to specific elements or to the entire page using CSS (and thus inherited by all other elements).*~~ [2022-06-13]
- [X] ~~*Do NOT require horizontal scrolling when the text size is doubled.*~~ [2022-06-13]

#### [1.4.9 Images of Text (No Exception) (Level AAA)](https://www.w3.org/TR/WCAG21/#images-of-text-no-exception)

- [X] ~~*Text is used within an image only for decoration (image does not convey content) OR when the information cannot be presented with text alone.*~~ [2022-06-13]

#### [1.4.10 Reflow (WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#reflow)

- [X] ~~*No loss of content or functionality occurs and horizontal scrolling is avoided when content is presented at a width of 320 pixels.*~~ [2022-06-13]
      This requires responsive design for most web sites. This is best tested by setting the browser window to 1280 pixels wide and then zooming the page content to 400%.
- [X] ~~*This requires responsive design for most web sites. This is best tested by setting the browser window to 1280 pixels wide and then zooming the page content to 400%.*~~ [2022-06-13]
- [X] ~~*Content that requires horizontal scrolling, such as data tables, complex images (such as maps and charts), toolbars, etc. are exempted.*~~ [2022-06-13]

#### [1.4.11 Non-text Contrast (WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#non-text-contrast)

- [X] ~~*A contrast ratio of at least 3:1 is present for differentiating graphical objects (such as icons and components of charts or graphs) and author-customized interface components (such as buttons, form controls, and focus indicators/outlines).*~~ [2022-06-13]
- [X] ~~*The various states (focus, hover, active, etc.) of author-customized interactive components must all present 3:1 contrast.*~~ [2022-06-13]

#### [1.4.12 Text Spacing(WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#text-spacing)

- [X] ~~*No loss of content or functionality occurs when the user adapts text line height/spacing to 1.5 times the font size, paragraph spacing to 2 times the font size, word spacing to .16 times the font size, and letter spacing to .12 times the font size.*~~ [2022-06-13]
- [X] ~~*This is best supported by avoiding pixel height definitions for elements that contain text.*~~ [2022-06-13]

#### [1.4.13 Content on Hover or Focus (WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#content-on-hover-or-focus)

- [ ] When additional content is presented on hover or keyboard focus:
      The newly revealed content can be dismissed (generally via the Esc key) without moving the pointer or keyboard focus, unless the content presents an input error or does not obscure or interfere with other page content.
      The pointer can be moved to the new content without the content disappearing.
      The new content must remain visible until the pointer or keyboard focus is moved away from the triggering control, the new content is dismissed, or the new content is no longer relevant.
- [ ] The newly revealed content can be dismissed (generally via the Esc key) without moving the pointer or keyboard focus, unless the content presents an input error or does not obscure or interfere with other page content.
- [ ] The pointer can be moved to the new content without the content disappearing.
- [ ] The new content must remain visible until the pointer or keyboard focus is moved away from the triggering control, the new content is dismissed, or the new content is no longer relevant.

## Guideline 2.1

### Keyboard Accessible: Make all functionality available from a keyboard

#### [2.1.1 Keyboard (Level A)](https://www.w3.org/TR/WCAG21/#keyboard)

- [ ] All page functionality is available using the keyboard, unless the functionality cannot be accomplished in any known way using a keyboard (e.g., free hand drawing).
     - **MAJOR limitation of this plugin! Will file a Github issue about potentially fixing it. No keyboard interaction appears to be available.**
- [ ] Page-specified shortcut keys and accesskeys (accesskey should typically be avoided) do not conflict with existing browser and screen reader shortcuts.

#### [2.1.2 No Keyboard Trap (Level A)](https://www.w3.org/TR/WCAG21/#no-keyboard-trap)

- [ ] Keyboard focus is never locked or trapped at one particular page element. The user can navigate to and from all navigable page elements using only a keyboard.

#### [2.1.3 Keyboard (No Exception) (Level AAA)](https://www.w3.org/TR/WCAG21/#keyboard-no-exception)

- [ ] All page functionality is available using the keyboard.

#### [2.1.4 Character Key Shortcuts (WCAG 2.1 Level A)](https://www.w3.org/TR/WCAG21/#character-key-shortcuts)

- [ ] If a keyboard shortcut uses printable character keys, then the user must be able to disable the key command, change the defined key to a non-printable key (Ctrl, Alt, etc.), or only activate the shortcut when an associated interface component or button is focused.

## Guideline 2.2

### Enough Time: Provide users enough time to read and use content

#### [2.2.1 Timing Adjustable (Level A)](https://www.w3.org/TR/WCAG21/#timing-adjustable)

- [X] ~~*If a page or application has a time limit, the user is given options to turn off, adjust, or extend that time limit. This is not a requirement for real-time events (e.g., an auction), where the time limit is absolutely required, or if the time limit is longer than 20 hours.*~~ [2022-06-13]

#### [2.2.2 Pause, Stop, Hide (Level A)](https://www.w3.org/TR/WCAG21/#pause-stop-hide)

- [X] ~~*Automatically moving, blinking, or scrolling content (such as carousels, marquees, or animations) that lasts longer than 5 seconds can be paused, stopped, or hidden by the user.*~~ [2022-06-13]
- [X] ~~*Automatically updating content (e.g., a dynamically-updating news ticker, chat messages, etc.) can be paused, stopped, or hidden by the user or the user can manually control the timing of the updates.*~~ [2022-06-13]

#### [2.2.3 No Timing (Level AAA)](https://www.w3.org/TR/WCAG21/#no-timing)

- [X] ~~*The content and functionality have no time limits or constraints.*~~ [2022-06-13]

#### [2.2.4 Interruptions (Level AAA)](https://www.w3.org/TR/WCAG21/#interruptions)

- [X] ~~*Interruptions (alerts, page updates, etc.) can be postponed or suppressed by the user.*~~ [2022-06-13]

#### [2.2.5 Re-authenticating (Level AAA)](https://www.w3.org/TR/WCAG21/#re-authenticating)

- [X] ~~*If an authentication session expires, the user can re-authenticate and continue the activity without losing any data from the current page.*~~ [2022-06-13]

#### [2.2.6 Timeouts (WCAG 2.1 Level AAA)](https://www.w3.org/TR/WCAG21/#timeouts)

- [X] ~~*Users must be warned of any timeout that could result in data loss, unless the data is preserved for longer than 20 hours of user inactivity.*~~ [2022-06-13]

## Guideline 2.3

### Seizures and Physical Reactions: Do not design content in a way that is known to cause seizures or physical reactions.

#### [2.3.1 Three Flashes or Below Threshold (Level A)](https://www.w3.org/TR/WCAG21/#three-flashes-or-below-threshold)

- [X] ~~*No page content flashes more than 3 times per second unless that flashing content is sufficiently small and the flashes are of low contrast and do not contain too much red. (See general flash and red flash thresholds)*~~ [2022-06-13]

#### [2.3.2 Three Flashes (Level AAA)](https://www.w3.org/TR/WCAG21/#three-flashes)

- [X] ~~*No page content flashes more than 3 times per second.*~~ [2022-06-13]

#### [2.3.3 Animation from Interactions (WCAG 2.1 Level AAA)](https://www.w3.org/TR/WCAG21/#animation-from-interactions)

- [ ] Users can disable non-essential animation and movement that is triggered by user interaction.
  - Wonder if the color transition on hover counts as animation?

## Guideline 2.4

### Navigable: Provide ways to help users navigate, find content, and determine where they are.

#### [2.4.1 Bypass Blocks (Level A)](https://www.w3.org/TR/WCAG21/#bypass-blocks)

- [X] ~~*A link is provided to skip navigation and other page elements that are repeated across web pages.*~~ [2022-06-13]
- [X] ~~*A proper heading structure and/or identification of page regions/landmarks may be considered a sufficient technique. Because navigating by headings or regions is not supported in most browsers, WebAIM recommends a "skip" link (in addition to headings and regions) to best support sighted keyboard users.*~~ [2022-06-13]

#### [2.4.2 Page Titled (Level A)](https://www.w3.org/TR/WCAG21/#page-titled)

- [X] ~~*The web page has a descriptive and informative page title.*~~ [2022-06-13]

#### [2.4.3 Focus Order (Level A)](https://www.w3.org/TR/WCAG21/#focus-order)

- [ ] The navigation order of links, form elements, etc. is logical and intuitive.
  - **I wonder how this would be to navigate by keyboard. It's a little bit of "mystery meat" navigation.**

#### [2.4.4 Link Purpose (In Context) (Level A)](https://www.w3.org/TR/WCAG21/#link-purpose-in-context)

- [ ] The purpose of each link (or form image button or image map hotspot) can be determined from the link text alone, or from the link text and its context (e.g., surrounding text, list item, table cell, or table headers).
  - **Links aren't even links, as rendered by the script.**
  - **Kind of due to limitations of the script but also because I thought it was unique to have URLs that aren't actually links (just the text), there are also unlinked URLs.**
- [X] ~~*Links (or form image buttons) with the same text that go to different locations are readily distinguishable.*~~ [2022-06-13]

#### [2.4.5 Multiple Ways (Level AA)](https://www.w3.org/TR/WCAG21/#multiple-ways)

- [ ] Multiple ways are available to find other web pages on the site - at least two of: a list of related pages, table of contents, site map, site search, or list of all available web pages.
  - **This could be a good interim solution, just providing a plaintext outline? There is a lot of redundancy in the way the navigation syntax works for telescopic text.**

#### [2.4.6 Headings and Labels (Level AA)](https://www.w3.org/TR/WCAG21/#headings-and-labels)

- [X] ~~*Page headings and labels for form and interactive controls are informative. Avoid duplicating heading (e.g., "More Details") or label text (e.g., "First Name") unless the structure provides adequate differentiation between them.*~~ [2022-06-13]

#### [2.4.7 Focus Visible (Level AA)](https://www.w3.org/TR/WCAG21/#focus-visible)

- [ ] It is visually apparent which page element has the current keyboard focus (i.e., as you tab through the page, you can see where you are).
  - **Big missing piece! But should be doable to add.**

#### [2.4.8 Location (Level AAA)](https://www.w3.org/TR/WCAG21/#location)

- [ ] If a web page is part of a sequence of pages or within a complex site structure, an indication of the current page location is provided, for example, through breadcrumbs or specifying the current step in a sequence (e.g., "Step 2 of 5 - Shipping Address").

#### [2.4.9 Link Purpose (Link Only) (Level AAA)](https://www.w3.org/TR/WCAG21/#link-purpose-link-only)

- [ ] The purpose of each link (or form image button or image map hotspot) can be determined from the link text alone.
  - **I wonder what the best practice would be here, when the interaction model is zooming into words. Maybe an explanation at the top of how to interpret link text, as areas you want to "zoom" into.**
- [ ] There are no links (or form image buttons) with the same text that go to different locations.

#### [2.4.10 Section Headings (Level AAA)](https://www.w3.org/TR/WCAG21/#section-headings)

- [ ] Beyond providing an overall document structure, individual sections of content are designated using headings, where appropriate.
  - **The structure of the content once fully expanded is pretty much a wall of text. It could be cleaned up so I think there's hope for semantics. It's more of a style thing that it appears now as a block of text, I think.**

## Guideline 2.5

### Input Modalities: Make it easier for users to operate functionality through various inputs beyond keyboard.

#### [2.5.1 Pointer Gestures (WCAG 2.1 Level A)](https://www.w3.org/TR/WCAG21/#pointer-gestures)

- [ ] If multipoint or path-based gestures (such as pinching, swiping, or dragging across the screen) are not essential to the functionality, then the functionality can also be performed with a single point activation (such as activating a button).

#### [2.5.2 Pointer Cancellation (WCAG 2.1 Level A)](https://www.w3.org/TR/WCAG21/#pointer-cancellation)

- [ ] To help avoid inadvertent activation of controls, avoid non-essential down-event (e.g., onmousedown) activation when clicking, tapping, or long pressing the screen. Use onclick, onmouseup, or similar instead. If onmouseup (or similar) is used, you must provide a mechanism to abort or undo the action performed.

#### [2.5.3 Label in Name (WCAG 2.1 Level A)](https://www.w3.org/TR/WCAG21/#label-in-name)

- [ ] If an interface component (link, button, etc.) presents text (or images of text), the accessible name (label, alternative text, aria-label, etc.) for that component must include the visible text.

#### [2.5.4 Motion Actuation (WCAG 2.1 Level A)](https://www.w3.org/TR/WCAG21/#motion-actuation)

- [ ] Functionality that is triggered by moving the device (such as shaking or panning a mobile device) or by user movement (such as waving to a camera) can be disabled and equivalent functionality is provided via standard controls like buttons.

#### [2.5.5 Target Size (WCAG 2.1 Level AAA)](https://www.w3.org/TR/WCAG21/#target-size)

- [ ] Clickable targets are at least 44 by 44 pixels in size unless an alternative target of that size is provided, the target is inline (such as a link within a sentence), the target is not author-modified (such as a default checkbox), or the small target size is essential to the functionality.
  - **Can't guarantee this currently given VW based sizing but would be possible to implement.**

#### [2.5.6 Concurrent Input Mechanisms (WCAG 2.1 Level AAA)](https://www.w3.org/TR/WCAG21/#concurrent-input-mechanisms)

- [ ] Content does not restrict input to a specific modality, such as touch-only or keyboard-only, but must support alternative inputs (such as using a keyboard on a mobile device).
  - **Currently a fail, and a big one. I would love for this to be keyboard navigable.**

## Guideline 3.1

### Readable: Make text content readable and understandable

#### [3.1.1 Language of Page (Level A)](https://www.w3.org/TR/WCAG21/#language-of-page)

- [X] ~~*The language of the page is identified using the HTML lang attribute (e.g., `<html lang="en">`).*~~ [2022-06-13]

#### [3.1.2 Language of Parts (Level AA)](https://www.w3.org/TR/WCAG21/#language-of-parts)

- [ ] The language of page content that is in a different language is identified using the lang attribute (e.g., `<blockquote lang="es">`).

#### [3.1.3 Unusual Words (Level AAA)](https://www.w3.org/TR/WCAG21/#unusual-words)

- [X] ~~*Words that may be ambiguous, unfamiliar, or used in a very specific way are defined through adjacent text, a definition list, a glossary, or other suitable method.*~~ [2022-06-13]

#### [3.1.4 Abbreviations (Level AAA)](https://www.w3.org/TR/WCAG21/#abbreviations)

- [X] ~~*The meaning of an unfamiliar abbreviation is provided by expanding it the first time it is used, using the `<abbr>` element, or linking to a definition or glossary.*~~ [2022-06-13]

#### [3.1.5 Reading Level (Level AAA)](https://www.w3.org/TR/WCAG21/#reading-level)

- [ ] A more understandable alternative is provided for content that is more advanced than can be reasonably read by a person with roughly 9 years of primary education.
  - **Need to run text through a checker for this.**

#### [3.1.6 Pronunciation (Level AAA)](https://www.w3.org/TR/WCAG21/#pronunciation)

- [ ] If the pronunciation of a word is vital to understanding that word, its pronunciation is provided immediately following the word or via a link or glossary.

## Guideline 3.2

### Predictable: Make Web pages appear and operate in predictable ways

#### [3.2.1 On Focus (Level A)](https://www.w3.org/TR/WCAG21/#on-focus)

- [X] ~~*When a page element receives focus, it does not result in a substantial change to the page, the spawning of a pop-up window, an additional change of keyboard focus, or any other change that could confuse or disorient the user.*~~ [2022-06-13]

#### [3.2.2 On Input (Level A)](https://www.w3.org/TR/WCAG21/#on-input)

- [ ] When a user inputs information or interacts with a control, it does not result in a substantial change to the page, the spawning of a pop-up window, an additional change of keyboard focus, or any other change that could confuse or disorient the user unless the user is informed of the change ahead of time.

#### [3.2.3 Consistent Navigation (Level AA)](https://www.w3.org/TR/WCAG21/#consistent-navigation)

- [ ] Navigation links that are repeated on web pages do not change order when navigating through the site.

#### [3.2.4 Consistent Identification (Level AA)](https://www.w3.org/TR/WCAG21/#consistent-identification)

- [ ] Elements that have the same functionality across multiple web pages are consistently identified. For example, a search box at the top of the site should always be labeled the same way.

#### [3.2.5 Change on Request (Level AAA)](https://www.w3.org/TR/WCAG21/#change-on-request)

- [X] ~~*Substantial changes to the page, the spawning of pop-up windows, uncontrolled changes of keyboard focus, or any other change that could confuse or disorient the user must be initiated by the user. Alternatively, the user is provided an option to disable such changes.*~~ [2022-06-13]

## Guideline 3.3

### Input Assistance: Help users avoid and correct mistakes

#### [3.3.1 Error Identification (Level A)](https://www.w3.org/TR/WCAG21/#error-identification)

- [ ] Required form elements or form elements that require a specific format, value, or length provide this information within the element's label.
- [ ] Form validation errors are efficient, intuitive, and accessible. The error is clearly identified, quick access to the problematic element is provided, and the user can easily fix the error and resubmit the form.

#### [3.3.2 Labels or Instructions (Level A)](https://www.w3.org/TR/WCAG21/#labels-or-instructions)

- [ ] Sufficient labels, cues, and instructions for required interactive elements are provided via instructions, examples, properly positioned form labels, and/or fieldsets/legends.

#### [3.3.3 Error Suggestion (Level AA)](https://www.w3.org/TR/WCAG21/#error-suggestion)

- [ ] If an input error is detected (via client-side or server-side validation), suggestions are provided for fixing the input in a timely and accessible manner.

#### [3.3.4 Error Prevention (Legal, Financial, Data) (Level AA)](https://www.w3.org/TR/WCAG21/#minimize-error-reversible)

- [ ] If the user can change or delete legal, financial, or test data, the changes/deletions can be reversed, verified, or confirmed.

#### [3.3.5 Help (Level AAA)](https://www.w3.org/TR/WCAG21/#help)

- [ ] Instructions and cues are provided in context to help in form completion and submission.

#### [3.3.6 Error Prevention (All) (Level AAA)](https://www.w3.org/TR/WCAG21/#error-prevention-all)

- [ ] If the user can submit information, the submission is reversible, verified, or confirmed.

## Guideline 4.1

### Compatible: Maximize compatibility with current and future user agents, including assistive technologies

#### [4.1.1 Parsing (Level A)](https://www.w3.org/TR/WCAG21/#parsing)

- [ ] Significant HTML/XHTML validation/parsing errors are avoided. Check at http://validator.w3.org/

#### [4.1.2 Name, Role, Value (Level A)](https://www.w3.org/TR/WCAG21/#name-role-value)

- [ ] Markup is used in a way that facilitates accessibility. This includes following the HTML/XHTML specifications and using forms, form labels, frame titles, etc. appropriately.
- [ ] ARIA is used appropriately to enhance accessibility when HTML is not sufficient.

#### [4.1.3 Status Messages (WCAG 2.1 Level AA)](https://www.w3.org/TR/WCAG21/#status-messages)

- [ ] If an important status message is presented and focus is not set to that message, the message must be announced to screen reader users, typically via an ARIA alert or live region.
