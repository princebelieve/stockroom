import { copyFileSync, constants, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
  ...(!process.argv.includes('--aab-only') ? [{ source: 'android/app/build/outputs/mapping/directRelease/mapping.txt', extension: 'direct-mapping.txt' }] : []),
  { source: 'android/app/build/outputs/bundle/playStoreRelease/app-playStore-release.aab', extension: 'aab' },
  { source: 'android/app/build/outputs/mapping/playStoreRelease/mapping.txt', extension: 'mapping.txt' },
  { source: 'android/app/build/outputs/native-debug-symbols/playStoreRelease/native-debug-symbols.zip', extension: 'symbols.zip', optional: true },
]

for (const artifact of artifacts) {
  const source = resolve(projectRoot, artifact.source)
  const destination = resolve(outputDirectory, `Stockroom-Android-${versionName}-${versionCode}.${artifact.extension}`)
  if (!existsSync(source)) {
    if (artifact.optional) {
      console.warn(`Optional release artifact was not generated: ${source}`)
      continue
    }
    throw new Error(`Required release artifact was not generated: ${source}`)
  }
  if (existsSync(destination)) {
    const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
    const destinationHash = createHash('sha256').update(readFileSync(destination)).digest('hex')
    if (sourceHash === destinationHash) {
      console.log(`Already current: ${destination}`)
      continue
    }
    throw new Error(`Refusing to replace a different release artifact: ${destination}`)
  }
  try {
    copyFileSync(source, destination, constants.COPYFILE_EXCL)
    console.log(`Created ${destination}`)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Release artifact changed during packaging: ${destination}`)
    throw error
  }
}
