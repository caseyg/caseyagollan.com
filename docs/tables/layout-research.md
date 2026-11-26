# Laying out a table: research and what was built

November 2026. Casey asked for research into layout algorithms for tldraw and for charts in
general (d3, Pele, force-directed layouts, org charts, mind maps), and for much better tools
for the chat to fix the layout of a selection or a whole table.

The result is one engine, `src/lib/table-arrange.ts`, behind the chat's existing
`table_arrange` tool. This note records what was looked at, what each layout borrows, and what
was left out.

## What a table needs from a layout

A table is not a chart. Four things narrow the field:

1. **Cards have real, different sizes.** A sticky note grows with its text, a book is tall, a
   frame is as big as what it holds. Most textbook layouts assume points or equal circles.
   Every layout here works from measured boxes.
2. **The graph is whatever arrows are there.** Arrows tied to two items (tldraw bindings) are
   edges. Most items on most tables are joined to nothing, so every graph layout needs an
   answer for the loose ones.
3. **Frames nest.** A frame moves as one box with what it holds, an arrow into a frame's item
   counts as an arrow to the frame at the level above, and a frame's inside can be laid out
   on its own and the frame refitted.
4. **A small model calls it.** The chat model has eight rounds and no eye for coordinates. One
   call must do the whole job, be the same every time (so a second call doesn't shuffle the
   table), and report back in a few words.

## What was looked at

### tldraw's own helpers

The editor ships `alignShapes`, `distributeShapes`, `stackShapes`, `packShapes`,
`stretchShapes`, `flipShapes` and `resizeToBounds` (checked in `@tldraw/editor` 5.6). They are
what the toolbar's arrange menu calls. They work on bounding boxes and know nothing of arrows
or frames (and `packShapes` names its gap argument `_gap`). The chat already
used `alignShapes` and `distributeShapes`, and still does. `packShapes` is replaced by a shelf
packer of our own so the replay harness can run the same code without a canvas. tldraw has no
tree, layered or force layout of its own.

### Pele (pele.run)

Pele draws Mermaid diagrams for posts and wiki pages here. Its docs say it is "small,
synchronous, has no runtime dependencies", with "its own layout and visual style", and that
with a `maxWidth` it "may wrap labels, reduce spacing, or rearrange the diagram", switching a
wide left-to-right flowchart to top-to-bottom below 640 pixels. The docs do not name the
algorithm. The package's type declarations show the shape of it: `layout/layered` (ranks,
dummy nodes, label nodes and ports: a Sugiyama-style layered layout written from scratch),
`layout/compound` (groups with padding and their own direction, for subgraphs),
`layout/components` (`wrapComponents`: separate pieces wrapped to a width) and `layout/lanes`.

None of that is exported, and Mermaid text cannot carry card sizes, so Pele cannot lay out a
table. What it does teach, and what was taken:

- **Synchronous and deterministic.** No animation loop to wait on, the same input gives the
  same picture.
- **Lay out each connected piece on its own, then wrap the pieces to a width.** That is how
  `arrange` handles a table with several small graphs and a pile of loose cards.
- **Compound nodes.** A group is a node at the level above. Frames work the same way here.

### d3

- **d3-hierarchy `tree`** is Reingold and Tilford's tidy tree (Buchheim's linear-time
  version): children packed as close as their outlines allow, parents centred. It assumes one
  node size; cards of different sizes need the "non-layered" variant (van der Ploeg, as in
  d3-flextree). The tree here is simpler: each subtree gets a band as wide as its children
  side by side, and each depth a band as deep as its deepest card. It wastes a little room
  where outlines could interlock, and in exchange it cannot overlap and ranks line up, which
  is what an org chart wants.
- **d3-hierarchy `cluster`, `pack`, `treemap`, `partition`** draw quantities (leaf-aligned
  dendrograms, nested circles, squarified rectangles). They resize the things they place, and
  a card's size is not ours to change. Not used.
- **d3-force** is a velocity Verlet simulation of springs (links), charges (many-body, via a
  Barnes-Hut quadtree) and constraints. It is already a dependency for the homepage graph, and
  its random jiggle comes from a fixed-seed generator, so run for a set number of ticks it is
  deterministic. Its `forceCollide` is for circles, so `force` here adds a rectangle collision
  force, starts every card where it is, and holds it loosely to that spot, so the table keeps
  its shape and joined things draw together. Force layouts are the right tool for "how do
  these relate" and the wrong one for anything with a direction.

### Layered graph drawing: dagre and ELK

The Sugiyama method draws a directed graph in ranks: break cycles, assign ranks (dagre uses
network simplex), order each rank to cross as few edges as possible (barycentre and median
sweeps), then assign coordinates (Brandes and Köpf). It is what Mermaid, Graphviz `dot` and
Pele all do for flowcharts.

- **dagre** (`@dagrejs/dagre` 3.1, about 49 KB minified) takes node sizes, a direction and
  spacings and returns centres. It is synchronous and deterministic. **Used for `layered`.**
- **ELK** (`elkjs`) is the most capable option: layered with ports and orthogonal routing,
  `mrtree`, `radial`, `stress`, `rectpacking`, real compound graphs. It is over a megabyte and
  asynchronous (it wants a worker). Too heavy for a table page; worth revisiting if tables
  ever need routed, orthogonal edges.

tldraw draws an arrow as a straight line, an arc or an elbow between its two ends, so dagre's
routed bend points can't be used. Instead, after a graph layout each arrow is straightened,
then given the gentlest arc that clears any card in its way (`bendAround`).

### Constraint layout: WebCola

cola.js does stress majorisation with separation constraints (VPSC), which is the principled
way to say "no overlaps, keep these aligned, keep this group together" in a force layout. It
is the closest thing to "tidy up but keep my arrangement". It has seen little maintenance in years and would be a second layout engine to carry.
What was taken is the idea of a last overlap-removal pass that moves things as little as
possible: `separate` pushes each too-close pair apart along the axis they overlap less on.

### Mind maps and radial trees

A mind map is a tree drawn sideways from the middle: the root's branches are shared between
left and right so the two sides weigh about the same, and each side is a tidy tree growing
outward. A radial tree puts each depth on a ring and gives each subtree a wedge in proportion
to its leaves (Eades; `d3.tree` with polar coordinates does the same). Both treat arrows as
undirected and start from the best-connected card unless told the root. With cards instead of
dots, a ring's radius has to be large enough for its tightest wedge to fit its card.

### Packing: grid, masonry, shelves

- **Grid**: columns as wide as their widest card, rows as tall as their tallest. Already here.
- **Masonry**: each card into the shortest column (Pinterest, CSS `masonry`). Already here as
  `columns`.
- **Shelf packing** (next-fit decreasing height): sort by height, fill rows. Simple, tight
  enough, order not kept. This is `pack`, and it is also how separate graph pieces and
  clusters are set side by side.
- Skyline and MaxRects pack tighter and scramble more; a table is read, not printed, so they
  were left out.

### Clustering

Grouping is two jobs: deciding the groups, and drawing them. Deciding by meaning is the
model's job, so `cluster` takes named groups of ids and does only the geometry: each group a
small grid, groups shelved apart, each named group wrapped in a frame. Without groups it can
split by kind of thing, colour, or what arrows join.

## What was built

`arrange({ mode, boxes, edges, ... })` returns a top-left for every box.

| mode | for | from |
| --- | --- | --- |
| `auto` | "clean this up" | picks: tree if the arrows are a forest, layered if they merge or loop, else grid, or masonry when heights differ. On a whole table it lays out each frame's inside first. |
| `grid`, `columns`, `row`, `column` | sets without arrows | as before; now in the order the ids are given |
| `pack` | tightest | shelf packing |
| `tree` | org charts, hierarchies | tidy tree with bands, any of four directions |
| `mindmap` | one idea, branches both sides | balanced two-sided tree |
| `radial` | everything around one thing | leaf-weighted wedges on rings |
| `layered` | flows that merge, skip or loop | dagre |
| `force` | networks | d3-force with rectangle collision, anchored to where things are |
| `cluster` | groups by theme or kind | grids shelved apart, framed |

Rules every mode keeps:

- **Nothing overlaps.** Positions are on the 20-unit dot grid, and `separate` settles
  whatever rounding, rings or springs left too close.
- **Deterministic.** The same table and arrows give the same layout. A test checks it.
- **Loose cards are not lost.** In a graph layout, cards joined to nothing go in a grid
  underneath, and the result says how many.
- **No arrows, no graph.** Asked for a tree with no arrows, it falls back to a grid and says
  to connect things first.
- **It stays where it was.** The set keeps its top-left corner unless given a place.
- **What it lands on moves.** Arranging a selection or a frame's inside pushes neighbours
  down rather than covering them, and a frame's name (drawn above it) counts as part of it.

On the canvas (`TableEditor.tsx`, `arrangeOp`) the scope is the whole table, some ids, or the
inside of one frame (by id or by its name). Children are moved by page distance, frames are
refitted with tldraw's `fitFrameToContent`, and it is one undo step.

## What the chat sees

No new tool. `table_arrange` gained `layout` values, `inside`, `direction`, `root`, `groups`,
`by`, `frame` and `arrows`. The prompt maps Casey's words to layouts ("org chart" is `tree`,
"clean up" is `auto`). The prompt and schemas together grew by about 2,000 characters (some 500 tokens a request).

`utils/chat-eval` has seven new scenarios on messy tables (`layout-*`): a heap, an org chart,
a mind map, grouping by theme, a frame's inside, a selection, and a process. The stand-in
table runs the same `arrange`, so the replays test the real geometry.

## Not done, and why

- **Routed edges.** Orthogonal routing around cards needs ELK or a router of our own, and
  tldraw arrows can't hold arbitrary paths. Arcs around obstacles cover most cases.
- **Tighter trees.** Contour-based packing would save room on big, uneven trees.
- **Incremental layout.** `force` is the only mode that respects where things already are.
  A constraint layout in the manner of WebCola would do "tidy, but keep my arrangement" for
  the others.
- **A toolbar menu.** The layouts are reachable only through the chat. The engine is pure, so
  an Arrange menu on the table's toolbar could call it directly.
