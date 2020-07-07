/* eslint-disable no-console */

const path = require('path')
const fs = require('fs')
const { Release } = require('@dreamnet/deploy')
const Seven = require('node-7z')

//
const output = []

//
process.env.DEPLOY_GIT_REPO = 'waifu2x-chainer'

if (process.env.GITHUB_REF) {
  // eslint-disable-next-line prefer-destructuring
  process.env.DEPLOY_GIT_TAG = process.env.GITHUB_REF.split('/')[2]
} else if (process.env.GITHUB_SHA) {
  process.env.DEPLOY_GIT_TAG = process.env.GITHUB_SHA.substring(0, 7)
}

//
const VERSION = process.env.DEPLOY_GIT_TAG
const DISTPATH = path.resolve(__dirname, '../../dist/waifu2x')
const FILENAME = `waifu2x-${VERSION}-${process.env.BUILD_PLATFORM}-${process.env.BUILD_DEVICE}.7z`
const FULLPATH = path.resolve(DISTPATH, '../', FILENAME)
const PROVIDERS = []

if (process.env.GITHUB_REF) {
  PROVIDERS.push('Github', 'DreamLinkCluster', 'MEGA')
}

/**
 *
 *
 * @param {Release} release
 */
async function run(release) {
  if (PROVIDERS.length === 0) {
    return
  }
  
  release.addProvider(PROVIDERS)

  release.on('upload_begin', (provider) => {
    console.log(`Uploading to ${provider.label}...`)
  })

  release.on('upload_success', (result, provider) => {
    console.log(`✔️ Uploaded to ${provider.label}!`)
  })

  release.on('upload_fail', (error, provider) => {
    console.warn(`❌ Upload to ${provider.label} failed: ${error.message}`)
  })

  release.on('pin_begin', (provider) => {
    console.log(`Pinning to ${provider.label}...`)
  })

  release.on('pin_success', (cid, provider) => {
    console.log(`✔️ Pinned to ${provider.label}!`)
  })

  release.on('pin_fail', (error, provider) => {
    console.log(`❌ Pin to ${provider.label} failed: ${error.message}`)
  })

  const response = await release.run()

  if (process.env.DEPLOY_GIT_TAG.includes('early')) {
    output.push(release.cryptr.encrypt(JSON.stringify(response)))
  } else {
    output.push(response)
  }
}

/**
 *
 *
 * @returns 
 */
function compress() {
  console.log('Compressing...')
  process.chdir(DISTPATH)

  return new Promise((resolve, reject) => {
    const seven = Seven.add(FULLPATH, '*', {
      recursive: true
    })

    seven.on('error', (err) => {
      reject(error)
    })

    seven.on('end', (info) => {
      resolve(info)
    })
  })
}

/**
 *
 *
 */
async function start() {
  if (fs.existsSync(DISTPATH)) {
    await compress()

    const release = new Release(FULLPATH)
    await run(release)
  } else {
    console.warn(`The project has not been compiled! ${DISTPATH}`)
  }

  // Print results
  console.log(JSON.stringify(output, null, 2))
}


start()
