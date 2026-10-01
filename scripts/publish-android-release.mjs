import { copyFileSync, constants, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gradle = readFileSync(resolve(projectRoot, 'android/app/build.gradle'), 'utf8')
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1]
const versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1]
if (!versionName || !versionCode) throw new Error('Could not read Android versionName/versionCode from android/app/build.gradle.')

const outputDirectory = resolve(projectRoot, 'release/android')
mkdirSync(outputDirectory, { recursive: true })
const artifacts = [
  ...(!process.argv.includes('--aab-only') ? [{ source: 'android/app/build/outputs/apk/direct/release/app-direct-release.apk', extension: 'apk' }] : []),
  { source: 'android/app/build/outputs/bundle/playStoreRelease/app-playStore-release.aab', extension: 'aab' },
]

for (const artifact of artifacts) {
  const source = resolve(projectRoot, artifact.source)
  const destination = resolve(outputDirectory, `Stockroom-Android-${versionName}-${versionCode}.${artifact.extension}`)
  try {
    copyFileSync(source, destination, constants.COPYFILE_EXCL)
    console.log(`Created ${destination}`)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Refusing to overwrite existing release artifact: ${destination}`)
    throw error
  }
}
