import { describe, expect, it } from 'vitest'
import { metadataFormValues, metadataNeedsRename, type MetadataRow } from './Metadata'

const row: MetadataRow = {
  id: '/music/tone.mp3',
  path: '/music/tone.mp3',
  name: 'tone.mp3',
  metadata: { title: 'Glue', artist: 'Bicep', album: '', year: '', genre: '', track: '' },
  original: { title: '', artist: '', album: '', year: '', genre: '', track: '' },
  originalName: 'tone.mp3',
  newFilename: 'Bicep - Glue.mp3',
}

describe('metadata form helpers', () => {
  it('keeps the preview filename when loading the inspector', () => {
    expect(metadataFormValues(row).newFilename).toBe('Bicep - Glue.mp3')
  })

  it('detects a filename proposal that needs saving', () => {
    expect(metadataNeedsRename(row)).toBe(true)
    expect(metadataNeedsRename({ ...row, newFilename: row.name })).toBe(false)
  })
})
