// CSS selector query engine for the html-parser tree
// Supports: tag, .class, #id, tag.class, [attr], [attr=value], descendant (space), child (>)

export function query(root, selector) {
  const parts = parseSelector(selector);
  return matchSelector(root, parts);
}

export function queryOne(root, selector) {
  const results = query(root, selector);
  return results.length > 0 ? results[0] : null;
}

// Parse selector string into segments
// "div .card > h2.title" → [{combinator: null, matcher}, {combinator: ' ', matcher}, {combinator: '>', matcher}]
function parseSelector(selector) {
  const segments = [];
  const tokens = tokenizeSelector(selector);

  let combinator = null;
  for (const token of tokens) {
    if (token === '>' || token === ' ') {
      combinator = token;
    } else {
      segments.push({ combinator, matcher: compileMatcher(token) });
      combinator = null;
    }
  }
  return segments;
}

function tokenizeSelector(selector) {
  const tokens = [];
  let current = '';
  let i = 0;

  while (i < selector.length) {
    const ch = selector[i];

    if (ch === ' ') {
      if (current) tokens.push(current);
      current = '';
      // Skip multiple spaces, check for >
      while (i < selector.length && selector[i] === ' ') i++;
      if (selector[i] === '>') {
        tokens.push('>');
        i++;
        while (i < selector.length && selector[i] === ' ') i++;
      } else {
        tokens.push(' ');
      }
      continue;
    }

    if (ch === '>') {
      if (current) tokens.push(current);
      current = '';
      tokens.push('>');
      i++;
      while (i < selector.length && selector[i] === ' ') i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current) tokens.push(current);
  return tokens;
}

// Compile a simple selector segment into a matcher function
// Supports: tag, .class, #id, tag.class, tag#id, [attr], [attr=value]
function compileMatcher(segment) {
  let tag = null;
  let classes = [];
  let id = null;
  let attrChecks = [];

  let remaining = segment;

  // Extract [attr] and [attr=value] parts
  while (remaining.includes('[')) {
    const start = remaining.indexOf('[');
    const end = remaining.indexOf(']', start);
    if (end === -1) break;

    const inside = remaining.substring(start + 1, end);
    const eqIdx = inside.indexOf('=');
    if (eqIdx === -1) {
      attrChecks.push({ name: inside.trim(), value: null });
    } else {
      const name = inside.substring(0, eqIdx).trim();
      let value = inside.substring(eqIdx + 1).trim();
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      attrChecks.push({ name, value });
    }

    remaining = remaining.substring(0, start) + remaining.substring(end + 1);
  }

  // Parse tag, .class, #id from remaining
  const parts = remaining.split(/(?=[.#])/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('.')) {
      classes.push(part.slice(1));
    } else if (part.startsWith('#')) {
      id = part.slice(1);
    } else {
      tag = part.toLowerCase();
    }
  }

  return function matches(node) {
    if (node.type !== 'element') return false;
    if (tag && node.tag !== tag) return false;
    if (id && (node.attrs.id || '') !== id) return false;

    if (classes.length > 0) {
      const nodeClasses = (node.attrs.class || '').split(/\s+/);
      for (const cls of classes) {
        if (!nodeClasses.includes(cls)) return false;
      }
    }

    for (const check of attrChecks) {
      if (check.value === null) {
        if (!(check.name in node.attrs)) return false;
      } else {
        if (node.attrs[check.name] !== check.value) return false;
      }
    }

    return true;
  };
}

function matchSelector(root, segments) {
  if (segments.length === 0) return [];

  // Find all nodes matching the first segment
  let candidates = findAllMatching(root, segments[0].matcher);

  // Apply subsequent segments
  for (let i = 1; i < segments.length; i++) {
    const { combinator, matcher } = segments[i];
    const nextCandidates = [];

    for (const candidate of candidates) {
      if (combinator === '>') {
        // Direct children only
        for (const child of (candidate.children || [])) {
          if (matcher(child)) nextCandidates.push(child);
        }
      } else {
        // Descendant — find all matching within subtree
        const descendants = findAllMatching(candidate, matcher);
        nextCandidates.push(...descendants);
      }
    }

    candidates = nextCandidates;
  }

  return candidates;
}

function findAllMatching(root, matcher) {
  const results = [];
  function walk(node) {
    if (matcher(node)) results.push(node);
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }
  if (root.children) {
    for (const child of root.children) walk(child);
  }
  return results;
}
