export type SemanticMarkerKind =
  | "pink"
  | "gold"
  | "annotation"
  | "comment"
  | "strike"
  | "code";

export interface SemanticMarkerRange {
  from: number;
  to: number;
  kind: SemanticMarkerKind;
  closed: boolean;
  marker: string;
}

const MARKERS: Array<{ marker: string; kind: SemanticMarkerKind }> = [
  { marker: "**", kind: "pink" },
  { marker: "++", kind: "comment" },
  { marker: "::", kind: "annotation" },
  { marker: "~~", kind: "strike" },
  { marker: "`", kind: "code" },
  { marker: "*", kind: "gold" },
];

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function findClosingMarker(text: string, marker: string, from: number): number {
  let index = from;
  while (index < text.length) {
    const found = text.indexOf(marker, index);
    if (found === -1) return -1;
    if (!isEscaped(text, found)) {
      if (marker !== "*" || (text[found - 1] !== "*" && text[found + 1] !== "*")) return found;
    }
    index = found + marker.length;
  }
  return -1;
}

/**
 * Deterministic Effie-style marker parser.
 *
 * Marker symbols are part of the visible document, so ranges always include
 * the opening and closing marker characters. An opening marker without a
 * closing marker decorates through the end of the current text block.
 *
 * Precedence is longest marker first. Nested markers are intentionally outer
 * first: once a complete outer range is found, its content is not re-parsed in
 * this version. This prevents duplicate or partially applied decorations while
 * the text is still being typed.
 */
export function parseSemanticMarkers(text: string): SemanticMarkerRange[] {
  const ranges: SemanticMarkerRange[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }

    const matched = MARKERS.find(({ marker }) => {
      if (!text.startsWith(marker, index)) return false;
      if (marker === "*" && (text[index - 1] === "*" || text[index + 1] === "*")) return false;
      return !isEscaped(text, index);
    });

    if (!matched) {
      index += 1;
      continue;
    }

    const openingEnd = index + matched.marker.length;
    const closing = findClosingMarker(text, matched.marker, openingEnd);
    if (closing === -1) {
      if (openingEnd < text.length) {
        ranges.push({
          from: index,
          to: text.length,
          kind: matched.kind,
          closed: false,
          marker: matched.marker,
        });
      }
      break;
    }

    if (closing === index + matched.marker.length) {
      index += matched.marker.length;
      continue;
    }

    ranges.push({
      from: index,
      to: closing + matched.marker.length,
      kind: matched.kind,
      closed: true,
      marker: matched.marker,
    });
    index = closing + matched.marker.length;
  }

  return ranges.sort((a, b) => a.from - b.from || b.to - a.to);
}

export function semanticClassName(kind: SemanticMarkerKind): string {
  return `river-semantic-${kind}`;
}
