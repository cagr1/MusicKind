import { describe, expect, it } from 'vitest'
import {
  mergeMetadataRows,
  metadataFormValues,
  metadataNeedsRename,
  metadataHasUnsavedChanges,
  metadataRowsToSave,
  metadataRowsToReview,
  saveMetadataBatch,
  type MetadataRow,
} from './Metadata'

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

  it('adds new paths without replacing an existing row with unsaved edits', () => {
    const edited = { ...row, metadata: { ...row.metadata, title: 'Unsaved title' } }
    const duplicate = { ...row, metadata: { ...row.metadata, title: 'Old title' } }
    const added = { ...row, id: '/music/new.mp3', path: '/music/new.mp3', name: 'new.mp3' }

    expect(mergeMetadataRows([edited], [duplicate, added])).toEqual([edited, added])
  })

  it('selects changed rows and leaves original matches for review', () => {
    const original = {
      ...row,
      id: '/music/original.mp3',
      metadata: { ...row.metadata, title: 'Suggested original' },
      newFilename: row.name,
      matchType: 'original' as const,
    }
    const editedOriginal = {
      ...original,
      id: '/music/edited-original.mp3',
      path: '/music/edited-original.mp3',
      metadata: { ...original.metadata, title: 'Edited original' },
    }
    expect(metadataHasUnsavedChanges(row)).toBe(true)
    expect(metadataRowsToSave([row, original, editedOriginal])).toEqual([row])
    expect(metadataRowsToSave([row, original, editedOriginal], [editedOriginal.id])).toEqual([
      row,
      editedOriginal,
    ])
    expect(metadataRowsToReview([row, original, editedOriginal])).toEqual([
      original,
      editedOriginal,
    ])
    expect(metadataRowsToReview([row, original, editedOriginal], [editedOriginal.id])).toEqual([
      original,
    ])
  })

  it('continues saving later rows after one row fails', async () => {
    const later = {
      ...row,
      id: '/music/later.mp3',
      path: '/music/later.mp3',
      name: 'later.mp3',
      originalName: 'later.mp3',
    }
    const savedRows: string[] = []
    const errors: string[] = []
    const summary = await saveMetadataBatch(
      [row, later],
      async (item) => {
        if (item.id === row.id) throw new Error('Target file already exists')
        return { ...item, original: { ...item.metadata }, newFilename: item.name }
      },
      (item) => savedRows.push(item.id),
      (item, message) => errors.push(`${item.id}:${message}`),
    )

    expect(savedRows).toEqual([later.id])
    expect(errors).toEqual([`${row.id}:Target file already exists`])
    expect(summary).toEqual({ saved: 1, errors: 1 })
  })
})
