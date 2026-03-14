import type { WorkspaceArtifactPreview } from "@shannon/shared";

export interface ArtifactPreviewSegment {
  text: string;
  match: boolean;
  matchIndex?: number;
}

export interface ArtifactPreviewSearchView {
  query: string;
  matchCount: number;
  segments: ArtifactPreviewSegment[];
}

export function buildArtifactPreviewSearchView(
  preview: WorkspaceArtifactPreview,
  query: string
): ArtifactPreviewSearchView {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    return {
      query: "",
      matchCount: 0,
      segments: [
        {
          text: preview.content,
          match: false
        }
      ]
    };
  }

  const lowerContent = preview.content.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const segments: ArtifactPreviewSegment[] = [];
  let searchIndex = 0;
  let lastIndex = 0;
  let matchCount = 0;

  while (searchIndex < preview.content.length) {
    const matchIndex = lowerContent.indexOf(lowerQuery, searchIndex);
    if (matchIndex === -1) {
      break;
    }

    if (matchIndex > lastIndex) {
      segments.push({
        text: preview.content.slice(lastIndex, matchIndex),
        match: false
      });
    }

    segments.push({
      text: preview.content.slice(matchIndex, matchIndex + normalizedQuery.length),
      match: true,
      matchIndex: matchCount
    });
    matchCount += 1;
    lastIndex = matchIndex + normalizedQuery.length;
    searchIndex = lastIndex;
  }

  if (lastIndex < preview.content.length) {
    segments.push({
      text: preview.content.slice(lastIndex),
      match: false
    });
  }

  return {
    query: normalizedQuery,
    matchCount,
    segments:
      segments.length > 0
        ? segments
        : [
            {
              text: preview.content,
              match: false
            }
          ]
  };
}
