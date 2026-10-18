/**
 * XSS Sanitization Library
 * Provides safe HTML sanitization for user-generated content.
 * Uses a lightweight allowlist approach - no external dependencies.
 */

// Safe HTML tags allowed in rich text content (instructions, descriptions, etc.)
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "code", "pre", "a", "span", "div",
  "img", "table", "thead", "tbody", "tr", "th", "td",
]);

// Safe attributes per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  span: new Set(["style", "class"]),
  div: new Set(["style", "class"]),
  "*": new Set(["class", "id"]), // global attributes
};

// Allowed CSS properties for style attribute
const ALLOWED_STYLES = new Set([
  "color", "background-color", "font-weight", "font-style",
  "text-decoration", "text-align", "margin", "padding",
  "font-size", "line-height", "display", "width", "height",
  "max-width", "max-height", "border", "border-radius",
]);

// Dangerous protocols that should never be in URLs
const DANGEROUS_PROTOCOLS = new Set([
  "javascript:", "vbscript:", "data:", "file:", "about:",
  "mocha:", "livescript:", "feed:", "market:",
]);

/**
 * Sanitize HTML string - removes all dangerous content.
 * Returns safe HTML or empty string if input is invalid.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") return "";

  // First pass: Remove all script/style tags and their content
  let output = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<input\b[^>]*>/gi, "")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "")
    .replace(/<select\b[^>]*>[\s\S]*?<\/select>/gi, "")
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, "");

  // Remove event handlers and javascript: URLs
  output = output
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, "")
    .replace(/javascript\s*:/gi, "blocked:")
    .replace(/vbscript\s*:/gi, "blocked:")
    .replace(/data\s*:/gi, "blocked:");

  // Parse and sanitize remaining tags
  return sanitizeTags(output);
}

/**
 * Parse HTML and keep only allowed tags/attributes.
 */
function sanitizeTags(html: string): string {
  // This is a simplified parser - for production consider DOMPurify on server
  // We use a regex-based approach for common cases

  // Replace disallowed tags with their text content
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

  return html.replace(tagRegex, (match, tagName, attrs) => {
    const lowerTag = tagName.toLowerCase();

    // Remove disallowed tags entirely (but keep content)
    if (!ALLOWED_TAGS.has(lowerTag)) {
      return ""; // Strip the tag, keep inner content
    }

    // Sanitize attributes
    const sanitizedAttrs = sanitizeAttributes(lowerTag, attrs);
    return `<${lowerTag}${sanitizedAttrs ? " " + sanitizedAttrs : ""}>`;
  });
}

/**
 * Sanitize attributes for a given tag.
 */
function sanitizeAttributes(tagName: string, attrs: string): string {
  const allowed = new Set([...(ALLOWED_ATTRS[tagName] || new Set()), ...(ALLOWED_ATTRS["*"] || new Set())]);
  const attrRegex = /(\w+)\s*=\s*(["'])([^"']*)\2/g;
  const results: string[] = [];

  let match;
  while ((match = attrRegex.exec(attrs)) !== null) {
    const [, attrName, , attrValue] = match;
    const lowerAttr = attrName.toLowerCase();

    if (!allowed.has(lowerAttr)) continue;

    // Special handling for href/src
    if ((lowerAttr === "href" || lowerAttr === "src") && isDangerousUrl(attrValue)) {
      continue; // Drop dangerous URLs
    }

    // Special handling for style
    if (lowerAttr === "style") {
      const sanitizedStyle = sanitizeStyle(attrValue);
      if (sanitizedStyle) {
        results.push(`style="${escapeAttrValue(sanitizedStyle)}"`);
      }
      continue;
    }

    // Special handling for target="_blank" on links
    if (lowerAttr === "target" && attrValue === "_blank") {
      results.push('target="_blank" rel="noopener noreferrer"');
      continue;
    }

    results.push(`${lowerAttr}="${escapeAttrValue(attrValue)}"`);
  }

  return results.join(" ");
}

/**
 * Sanitize CSS style attribute - only allow safe properties.
 */
function sanitizeStyle(style: string): string {
  const declarations = style.split(";").map((s) => s.trim()).filter(Boolean);
  const safe: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();

    if (ALLOWED_STYLES.has(prop) && !isDangerousCssValue(value)) {
      safe.push(`${prop}: ${value}`);
    }
  }

  return safe.join("; ");
}

/**
 * Check if URL uses a dangerous protocol.
 * Decodes HTML entities and strips control/whitespace characters first, so
 * obfuscated payloads such as `&#106;avascript:` or `java\tscript:` are caught.
 */
function isDangerousUrl(url: string): boolean {
  const decoded = decodeHtmlEntities(url);
  // Remove whitespace and control characters that browsers ignore when parsing
  // the scheme (e.g. "java\nscript:" is treated as "javascript:").
  const normalized = decoded.replace(/[\s\u0000-\u001F\u007F]/g, "").toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (normalized.startsWith(proto)) return true;
  }
  return false;
}

/**
 * Decode numeric (&#106; / &#x6A;) and a few common named HTML entities.
 */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeFromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCharCode(parseInt(dec, 10)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");
}

function safeFromCharCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Check for dangerous CSS values (expression, url(), etc.)
 */
function isDangerousCssValue(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("expression(") ||
    lower.includes("javascript:") ||
    lower.includes("vbscript:") ||
    lower.includes("behavior:") ||
    lower.includes("@import") ||
    /url\s*\(\s*["']?\s*(javascript|data|vbscript)/i.test(lower)
  );
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escape a value for use inside a double-quoted HTML attribute.
 * Unlike escapeHtml this intentionally leaves `&` alone so that plain-text
 * content (deal descriptions, instructions) does not end up double-encoded
 * when rendered as text. Escaping the quote character plus the angle brackets
 * is sufficient to prevent breaking out of the attribute context.
 */
function escapeAttrValue(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sanitize plain text for safe display (no HTML allowed).
 * Use for fields that should never contain HTML.
 */
export function sanitizeText(input: string, maxLen = 5000): string {
  if (!input || typeof input !== "string") return "";
  // Strip control characters except newlines/tabs
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitize text for use in HTML attributes.
 */
export function sanitizeAttribute(input: string, maxLen = 500): string {
  return escapeHtml(sanitizeText(input, maxLen));
}

/**
 * Sanitize a UPI ID - strict format validation.
 */
export function sanitizeUpiId(input: string): string {
  if (!input || typeof input !== "string") return "";
  const clean = input.trim().toLowerCase();
  // UPI format: username@provider (alphanumeric, dots, hyphens allowed in username)
  if (!/^[a-z0-9._-]{1,50}@[a-z0-9.-]{2,50}$/i.test(clean)) {
    return "";
  }
  return clean.slice(0, 100);
}

/**
 * Sanitize IFSC code.
 */
export function sanitizeIfsc(input: string): string {
  if (!input || typeof input !== "string") return "";
  const clean = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  // IFSC: 4 chars bank code + 0 + 6 chars branch = 11 chars
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean)) return "";
  return clean;
}

/**
 * Sanitize account number.
 */
export function sanitizeAccountNumber(input: string): string {
  if (!input || typeof input !== "string") return "";
  const clean = input.trim().replace(/[^0-9]/g, "");
  if (clean.length < 9 || clean.length > 18) return "";
  return clean;
}

/**
 * Sanitize phone number (Indian format).
 */
export function sanitizePhone(input: string): string {
  if (!input || typeof input !== "string") return "";
  const clean = input.replace(/[^0-9+]/g, "");
  // Indian numbers: 10 digits, optionally with +91 or 91 prefix
  const digits = clean.replace(/^(\+?91)?/, "");
  if (digits.length !== 10) return "";
  return digits;
}