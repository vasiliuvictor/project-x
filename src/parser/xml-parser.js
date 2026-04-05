// Minimal XML parser for RSS/Atom feeds
// Works with well-structured XML — not a general-purpose XML parser

export function parseXml(xml) {
  // Remove XML declaration and processing instructions
  xml = xml.replace(/<\?[^?]*\?>/g, '');
  // Remove CDATA wrappers but keep content
  xml = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Remove comments
  xml = xml.replace(/<!--[\s\S]*?-->/g, '');

  return parseNode(xml.trim());
}

function parseNode(xml) {
  const nodes = [];
  let pos = 0;

  while (pos < xml.length) {
    // Skip whitespace
    while (pos < xml.length && xml[pos] !== '<') pos++;
    if (pos >= xml.length) break;

    // Check for closing tag — means we're done at this level
    if (xml[pos + 1] === '/') break;

    // Extract tag
    const tagStart = pos;
    const tagEnd = xml.indexOf('>', pos);
    if (tagEnd === -1) break;

    const tagContent = xml.substring(pos + 1, tagEnd);
    const selfClosing = tagContent.endsWith('/');
    const cleanTag = selfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim();

    // Parse tag name and attributes
    const spaceIdx = cleanTag.indexOf(' ');
    const tagName = spaceIdx === -1 ? cleanTag : cleanTag.substring(0, spaceIdx);
    const attrsStr = spaceIdx === -1 ? '' : cleanTag.substring(spaceIdx + 1);
    const attrs = parseAttributes(attrsStr);

    pos = tagEnd + 1;

    if (selfClosing) {
      nodes.push({ tag: tagName, attrs, children: [], text: '' });
      continue;
    }

    // Find matching closing tag
    const closeTag = `</${tagName}>`;
    // Handle nested same-name tags by counting depth
    let depth = 1;
    let searchPos = pos;
    let closePos = -1;

    while (depth > 0 && searchPos < xml.length) {
      const nextOpen = xml.indexOf(`<${tagName}`, searchPos);
      const nextClose = xml.indexOf(closeTag, searchPos);

      if (nextClose === -1) {
        closePos = -1;
        break;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check it's actually an open tag (not a different tag starting with same name)
        const charAfterName = xml[nextOpen + tagName.length + 1];
        if (charAfterName === '>' || charAfterName === ' ' || charAfterName === '/') {
          depth++;
        }
        searchPos = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          closePos = nextClose;
        } else {
          searchPos = nextClose + closeTag.length;
        }
      }
    }

    if (closePos === -1) {
      // No closing tag found — treat as self-closing
      nodes.push({ tag: tagName, attrs, children: [], text: '' });
      continue;
    }

    const innerContent = xml.substring(pos, closePos);
    pos = closePos + closeTag.length;

    // Check if inner content has child tags
    if (innerContent.includes('<')) {
      const children = parseNode(innerContent);
      // Also extract direct text (content not inside child tags)
      const text = innerContent.replace(/<[^>]*>[^<]*/g, '').trim();
      nodes.push({ tag: tagName, attrs, children, text });
    } else {
      nodes.push({ tag: tagName, attrs, children: [], text: decodeEntities(innerContent.trim()) });
    }
  }

  return nodes;
}

function parseAttributes(str) {
  const attrs = {};
  const regex = /(\w[\w:-]*)=(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    attrs[match[1]] = decodeEntities(match[2] ?? match[3]);
  }
  return attrs;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// Helper: find all nodes with a given tag name (recursive)
export function findAll(nodes, tagName) {
  const results = [];
  for (const node of nodes) {
    if (node.tag === tagName) results.push(node);
    if (node.children.length > 0) {
      results.push(...findAll(node.children, tagName));
    }
  }
  return results;
}

// Helper: get text content of first child with given tag
export function getText(node, tagName) {
  for (const child of node.children) {
    if (child.tag === tagName) return child.text;
  }
  return '';
}

// Helper: get attribute of first child with given tag
export function getAttr(node, tagName, attrName) {
  for (const child of node.children) {
    if (child.tag === tagName) return child.attrs[attrName] || '';
  }
  return '';
}
