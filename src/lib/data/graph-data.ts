// Parsed from graph.md for easy editing

import graphMarkdown from "./graph.md?raw";

export interface Node {
  id: string;
  type: "center" | "category" | "subcategory" | "node" | "citation" | "loading";
  parent: string | null;
  selected: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  // Citation-specific fields
  url?: string;
  title?: string;
  page_age?: string | null;
  cited_text?: string | null;
}

export interface Link {
  source: string | Node;
  target: string | Node;
}

// Parse the markdown file to build the graph structure (supports recursive nesting)
function parseGraphMarkdown(
  markdown: string,
): { nodes: Node[]; links: Link[] } {
  const nodesMap = new Map<string, Node>();
  const links: Link[] = [];

  // Add Casey center node
  nodesMap.set("Casey", {
    id: "Casey",
    type: "center",
    parent: null,
    selected: false,
  });

  const lines = markdown.split("\n");
  // Stack to track parent at each indentation level
  const parentStack: Array<{ indent: number; id: string; type: string }> = [
    { indent: -2, id: "Casey", type: "center" },
  ];
  let inCrossLinks = false;

  for (const line of lines) {
    // Skip empty lines and headers
    if (!line.trim() || line.startsWith("#")) continue;

    // Check if we've reached the cross-links section
    if (line.trim() === "---") {
      inCrossLinks = true;
      continue;
    }

    // Skip comments
    if (line.trim().startsWith("<!--")) continue;

    // Parse cross-links
    if (inCrossLinks && line.startsWith("-")) {
      const linkMatch = line.match(/^-\s*(.+?)\s*->\s*(.+)$/);
      if (linkMatch) {
        const [, source, target] = linkMatch;
        links.push({ source: source.trim(), target: target.trim() });
      }
      continue;
    }

    // Match list items with any level of indentation
    const listMatch = line.match(/^(\s*)-\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const content = listMatch[2].trim();

      // Determine node type based on depth
      // Level 0 (no indent) = category
      // Level 1 (2 spaces) = subcategory
      // Level 2+ (4+ spaces) = node
      const depth = indent / 2; // Convert spaces to depth level
      let nodeType: "category" | "subcategory" | "node";
      if (depth === 0) {
        nodeType = "category";
      } else if (depth === 1) {
        nodeType = "subcategory";
      } else {
        nodeType = "node";
      }

      // Find parent by popping stack until we find a shallower indent
      while (
        parentStack.length > 0 &&
        parentStack[parentStack.length - 1].indent >= indent
      ) {
        parentStack.pop();
      }
      const parent = parentStack[parentStack.length - 1];

      // Only add node if it doesn't exist
      if (!nodesMap.has(content)) {
        nodesMap.set(content, {
          id: content,
          type: nodeType,
          parent: parent.id,
          selected: false,
        });
      }

      // Add link from parent to this node
      links.push({ source: parent.id, target: content });

      // Push this node onto the stack
      parentStack.push({ indent, id: content, type: nodeType });
    }
  }

  return { nodes: Array.from(nodesMap.values()), links };
}

// Parse the graph and export
const { nodes: allNodes, links: allLinks } = parseGraphMarkdown(graphMarkdown);

export { allLinks, allNodes };
