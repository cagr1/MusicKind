export interface SetPlaylistSections {
  warmup: string[]
  peak: string[]
  closing: string[]
}

export function defaultSetPlaylistSections(genres: string[]): SetPlaylistSections {
  const available = new Set(genres)
  return {
    warmup: ['Deep House', 'Afro House'].filter((genre) => available.has(genre)),
    peak: ['Tech House'].filter((genre) => available.has(genre)),
    closing: ['Indie Dance', 'House'].filter((genre) => available.has(genre)),
  }
}
