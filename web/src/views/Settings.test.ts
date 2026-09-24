import { describe, expect, it } from 'vitest'
import {
  dependencyAction,
  dependencyBusy,
  dependencyGroup,
  dependencyLabel,
  normalizeSettings,
} from './Settings'

describe('settings helpers', () => {
  it('normalizes persisted settings without inventing a path', () => {
    expect(normalizeSettings({ language: 'en', defaultOutputDir: '  ' })).toMatchObject({
      language: 'en',
      defaultOutputDir: 'output',
    })
  })

  it('maps installable dependencies to backend groups', () => {
    expect(dependencyGroup('librosa')).toBe('audio')
    expect(dependencyGroup('demucs')).toBe('stems')
    expect(dependencyGroup('acoustid')).toBeNull()
  })

  it('keeps dependency status explicit', () => {
    const labels = {
      checking: 'Checking',
      installed: 'Installed',
      missing: 'Missing',
      unavailable: 'Unavailable',
    }
    expect(dependencyLabel(true, labels)).toBe('Installed')
    expect(dependencyLabel(false, labels)).toBe('Missing')
    expect(dependencyLabel(null, labels)).toBe('Checking')
  })

  it('does not mark installed FFmpeg busy when nothing is running', () => {
    expect(dependencyBusy('ffmpeg', null, false, null)).toBe(false)
  })

  it('verifies installed dependencies instead of reinstalling them', () => {
    expect(dependencyAction('librosa', true, 'audio')).toBe('verify')
    expect(dependencyAction('librosa', false, 'audio')).toBe('install')
    expect(dependencyAction('acoustid', false, null)).toBeNull()
  })
})
