// Lightweight state-machine HTML parser
// Produces a DOM-like tree for selector queries

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

// States for the tokenizer
const STATE = {
  DATA: 0,
  TAG_OPEN: 1,
  TAG_NAME: 2,
  BEFORE_ATTR: 3,
  ATTR_NAME: 4,
  AFTER_ATTR_NAME: 5,
  BEFORE_ATTR_VALUE: 6,
  ATTR_VALUE_QUOTED: 7,
  ATTR_VALUE_UNQUOTED: 8,
  SELF_CLOSING: 9,
  CLOSE_TAG: 10,
  COMMENT: 11,
  RAW_TEXT: 12,
};

export function parse(html) {
  const tokens = tokenize(html);
  return buildTree(tokens);
}

function tokenize(html) {
  const tokens = [];
  let state = STATE.DATA;
  let pos = 0;
  let textBuf = '';
  let tagName = '';
  let attrName = '';
  let attrValue = '';
  let attrQuote = '';
  let attrs = {};
  let isClosing = false;
  let rawTagName = '';

  function flushText() {
    if (textBuf) {
      tokens.push({ type: 'text', value: textBuf });
      textBuf = '';
    }
  }

  function emitTag() {
    const tn = tagName.toLowerCase();
    if (isClosing) {
      tokens.push({ type: 'close', tag: tn });
    } else {
      tokens.push({ type: 'open', tag: tn, attrs: { ...attrs }, selfClose: VOID_ELEMENTS.has(tn) });
      if (VOID_ELEMENTS.has(tn)) {
        tokens.push({ type: 'close', tag: tn });
      }
    }
    tagName = '';
    attrs = {};
    isClosing = false;
  }

  while (pos < html.length) {
    const ch = html[pos];

    switch (state) {
      case STATE.DATA:
        if (ch === '<') {
          flushText();
          state = STATE.TAG_OPEN;
        } else {
          textBuf += ch;
        }
        pos++;
        break;

      case STATE.TAG_OPEN:
        if (ch === '/') {
          isClosing = true;
          state = STATE.CLOSE_TAG;
          pos++;
        } else if (ch === '!') {
          // Comment or doctype
          if (html.substring(pos, pos + 3) === '!--') {
            const endComment = html.indexOf('-->', pos + 3);
            pos = endComment === -1 ? html.length : endComment + 3;
            state = STATE.DATA;
          } else {
            // Doctype or other — skip to >
            const end = html.indexOf('>', pos);
            pos = end === -1 ? html.length : end + 1;
            state = STATE.DATA;
          }
        } else if (/[a-zA-Z]/.test(ch)) {
          tagName = '';
          state = STATE.TAG_NAME;
        } else {
          // Not a real tag, treat < as text
          textBuf += '<';
          state = STATE.DATA;
        }
        break;

      case STATE.TAG_NAME:
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          state = STATE.BEFORE_ATTR;
          pos++;
        } else if (ch === '>') {
          emitTag();
          pos++;
          // Enter raw text mode for script/style
          if (!isClosing && RAW_TEXT_ELEMENTS.has(tagName.toLowerCase())) {
            rawTagName = tagName.toLowerCase();
            state = STATE.RAW_TEXT;
          } else {
            state = STATE.DATA;
          }
          // Check for raw text after emit
          const lastToken = tokens[tokens.length - 1];
          if (lastToken && lastToken.type === 'close' && lastToken.tag && RAW_TEXT_ELEMENTS.has(lastToken.tag)) {
            // closing a raw element, stay in DATA
          } else if (lastToken && lastToken.type === 'open' && RAW_TEXT_ELEMENTS.has(lastToken.tag)) {
            rawTagName = lastToken.tag;
            state = STATE.RAW_TEXT;
          }
        } else if (ch === '/') {
          state = STATE.SELF_CLOSING;
          pos++;
        } else {
          tagName += ch;
          pos++;
        }
        break;

      case STATE.BEFORE_ATTR:
        if (ch === '>') {
          emitTag();
          pos++;
          const lastToken = tokens[tokens.length - 1];
          if (lastToken && lastToken.type === 'open' && RAW_TEXT_ELEMENTS.has(lastToken.tag)) {
            rawTagName = lastToken.tag;
            state = STATE.RAW_TEXT;
          } else {
            state = STATE.DATA;
          }
        } else if (ch === '/') {
          state = STATE.SELF_CLOSING;
          pos++;
        } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          pos++;
        } else {
          attrName = '';
          attrValue = '';
          state = STATE.ATTR_NAME;
        }
        break;

      case STATE.ATTR_NAME:
        if (ch === '=') {
          state = STATE.BEFORE_ATTR_VALUE;
          pos++;
        } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          state = STATE.AFTER_ATTR_NAME;
          pos++;
        } else if (ch === '>' || ch === '/') {
          attrs[attrName.toLowerCase()] = '';
          attrName = '';
          state = ch === '>' ? STATE.BEFORE_ATTR : STATE.SELF_CLOSING;
          if (ch === '>') {
            emitTag();
            pos++;
            const lastToken = tokens[tokens.length - 1];
            if (lastToken && lastToken.type === 'open' && RAW_TEXT_ELEMENTS.has(lastToken.tag)) {
              rawTagName = lastToken.tag;
              state = STATE.RAW_TEXT;
            } else {
              state = STATE.DATA;
            }
          } else {
            pos++;
          }
        } else {
          attrName += ch;
          pos++;
        }
        break;

      case STATE.AFTER_ATTR_NAME:
        if (ch === '=') {
          state = STATE.BEFORE_ATTR_VALUE;
          pos++;
        } else if (ch === '>' || ch === '/') {
          attrs[attrName.toLowerCase()] = '';
          attrName = '';
          if (ch === '>') {
            emitTag();
            pos++;
            state = STATE.DATA;
          } else {
            state = STATE.SELF_CLOSING;
            pos++;
          }
        } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          pos++;
        } else {
          // Previous attr had no value
          attrs[attrName.toLowerCase()] = '';
          attrName = '';
          state = STATE.ATTR_NAME;
        }
        break;

      case STATE.BEFORE_ATTR_VALUE:
        if (ch === '"' || ch === "'") {
          attrQuote = ch;
          attrValue = '';
          state = STATE.ATTR_VALUE_QUOTED;
          pos++;
        } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          pos++;
        } else if (ch === '>') {
          attrs[attrName.toLowerCase()] = '';
          attrName = '';
          emitTag();
          pos++;
          state = STATE.DATA;
        } else {
          attrValue = '';
          state = STATE.ATTR_VALUE_UNQUOTED;
        }
        break;

      case STATE.ATTR_VALUE_QUOTED:
        if (ch === attrQuote) {
          attrs[attrName.toLowerCase()] = attrValue;
          attrName = '';
          attrValue = '';
          state = STATE.BEFORE_ATTR;
          pos++;
        } else {
          attrValue += ch;
          pos++;
        }
        break;

      case STATE.ATTR_VALUE_UNQUOTED:
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          attrs[attrName.toLowerCase()] = attrValue;
          attrName = '';
          attrValue = '';
          state = STATE.BEFORE_ATTR;
          pos++;
        } else if (ch === '>') {
          attrs[attrName.toLowerCase()] = attrValue;
          attrName = '';
          attrValue = '';
          emitTag();
          pos++;
          state = STATE.DATA;
        } else {
          attrValue += ch;
          pos++;
        }
        break;

      case STATE.SELF_CLOSING:
        if (ch === '>') {
          const tn = tagName.toLowerCase();
          tokens.push({ type: 'open', tag: tn, attrs: { ...attrs }, selfClose: true });
          tokens.push({ type: 'close', tag: tn });
          tagName = '';
          attrs = {};
          isClosing = false;
          pos++;
          state = STATE.DATA;
        } else {
          pos++;
        }
        break;

      case STATE.CLOSE_TAG:
        if (ch === '>') {
          const tn = tagName.toLowerCase();
          tokens.push({ type: 'close', tag: tn });
          tagName = '';
          isClosing = false;
          pos++;
          state = STATE.DATA;
        } else if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
          tagName += ch;
          pos++;
        } else {
          pos++;
        }
        break;

      case STATE.RAW_TEXT: {
        const endTag = `</${rawTagName}`;
        const idx = html.toLowerCase().indexOf(endTag, pos);
        if (idx === -1) {
          pos = html.length;
        } else {
          // Skip raw content
          pos = idx;
          state = STATE.DATA;
        }
        break;
      }

      default:
        pos++;
    }
  }

  flushText();
  return tokens;
}

function buildTree(tokens) {
  const root = { type: 'root', tag: '', attrs: {}, children: [] };
  const stack = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    if (token.type === 'open') {
      const node = {
        type: 'element',
        tag: token.tag,
        attrs: token.attrs,
        children: [],
        parent: current,
      };
      current.children.push(node);
      if (!token.selfClose) {
        stack.push(node);
      }
    } else if (token.type === 'close') {
      // Pop stack — tolerate mismatched tags
      let found = false;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === token.tag) {
          stack.length = i;
          found = true;
          break;
        }
      }
      // If not found, just ignore the closing tag
    } else if (token.type === 'text') {
      const text = token.value.trim();
      if (text) {
        current.children.push({ type: 'text', value: token.value, parent: current });
      }
    }
  }

  return root;
}

// Get all text content from a node recursively
export function textContent(node) {
  if (node.type === 'text') return node.value;
  if (!node.children) return '';
  return node.children.map(textContent).join('').trim();
}

// Get attribute value
export function getAttr(node, name) {
  return node.attrs ? node.attrs[name] || '' : '';
}
