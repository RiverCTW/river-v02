export function applyDeletedNoteTombstones(previous: any, next: any) {
  const tombstones = new Set<string>(
    [...(previous?.deletedNoteIds || []), ...(next?.deletedNoteIds || [])].map(String),
  );
  if (!tombstones.size) return next;
  const keep = (item: any) =>
    !tombstones.has(String(item?.noteId || "")) && !tombstones.has(String(item?.id || ""));
  return {
    ...next,
    notes: (next?.notes || []).filter((note: any) => !tombstones.has(String(note?.id || ""))),
    sources: (next?.sources || []).filter(keep),
    profiles: (next?.profiles || []).filter(keep),
    introductions: (next?.introductions || []).filter(keep),
    nodes: (next?.nodes || []).filter(keep),
    blocks: (next?.blocks || []).filter(keep),
    learningMaps: (next?.learningMaps || []).filter(keep),
    chatMessages: (next?.chatMessages || []).filter(keep),
    deletedNoteIds: [...tombstones],
  };
}
