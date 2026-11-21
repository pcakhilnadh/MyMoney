import { describe, expect, it } from 'vitest'
import { compareVersions, matchVersions } from './version'

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('1.1.0', '1.0.9')).toBe(1)
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1)
  })
})

describe('matchVersions', () => {
  const server = { version: '1.1.0', apis: ['v1'] }
  it('says whether this build is current, behind or ahead of the server', () => {
    expect(matchVersions({ version: '1.1.0', api: 'v1' }, server)).toBe('same')
    expect(matchVersions({ version: '1.0.2', api: 'v1' }, server)).toBe('update')
    expect(matchVersions({ version: '1.2.0', api: 'v1' }, server)).toBe('ahead')
  })
  it('flags a build whose API the server no longer serves', () => {
    expect(matchVersions({ version: '0.9.0', api: 'v0' }, server)).toBe('unsupported')
  })
})
