/* eslint-disable no-return-await */
/* eslint-disable no-console */

// Copyright (C) DreamNet. All rights reserved.
// Written by Ivan Bravo Bravo <ivan@dreamnet.tech>, 2020.

const Octokit = require('@octokit/rest')
const mime = require('mime-types')
const { startsWith, truncate } = require('lodash')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')
const Seven = require('node-7z')

// Settings
const GITHUB_ORG = 'dreamnettech'
const GITHUB_REPO = 'waifu2x-chainer'

// Octokit
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

/**
 * GitHub Helper
 */
const GitHub = {
  get isTagRelease() {
    return startsWith(process.env.GITHUB_REF, 'refs/tags')
  },

  get tagName() {
    return this.isTagRelease ? process.env.GITHUB_REF.split('/')[2] : truncate(process.env.GITHUB_SHA, { length: 7, omission: '' })
  },

  async getRelease() {
    try {
      const response = await octokit.repos.getReleaseByTag({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        tag: this.tagName,
      })

      return response.data.upload_url
    } catch (error) {
      if (error.status !== 404) {
        throw error
      }

      console.log(`Creating release for tag: ${this.tagName}`)
      return await this.createRelease()
    }
  },

  async createRelease() {
    try {
      const response = await octokit.repos.createRelease({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        tag_name: this.tagName,
        name: VERSION,
        prerelease: true,
        draft: false,
      })

      return response.data.upload_url
    } catch (error) {
      console.warn(error)
      console.log('Retrying...')

      return await this.getRelease()
    }
  },
}

const VERSION = GitHub.tagName

function Release() {
  this.buildPath = path.resolve(__dirname, '../dist/waifu2x')

  this.fileName = `waifu2x-${VERSION}-${process.env.BUILD_PLATFORM}-${process.env.BUILD_DEVICE}.7z`

  this.filePath = path.resolve(__dirname, '../dist', this.fileName)

  this.zip = () => {
    console.log('Compressing...')
    process.chdir(this.buildPath)

    return new Promise((resolve, reject) => {
      const sevenProcess = Seven.add(this.filePath, '*', {
        recursive: true
      })

      sevenProcess.on('error', (err) => {
        reject(error)
      })

      sevenProcess.on('end', (info) => {
        resolve(info)
      })
    })
  }

  this.uploadToGithub = async () => {
    if (!process.env.GITHUB_TOKEN) {
      console.warn('No GITHUB_TOKEN!')
      return null
    }

    try {
      console.log(`Uploading ${this.fileName} to Github...`)

      const stats = fs.statSync(this.filePath)
      const url = await GitHub.getRelease()

      const response = await octokit.repos.uploadReleaseAsset({
        url,
        headers: {
          'content-length': stats.size,
          'content-type': mime.lookup(this.filePath),
        },
        name: this.fileName,
        file: fs.createReadStream(this.filePath),
      })

      return response
    } catch (err) {
      console.warn('Github error', err)
      return null
    }
  }

  this.uploadTo = async (url, formData, headers = {}) => {
    try {
      if (!formData) {
        formData = new FormData()
      }

      formData.append('file', fs.createReadStream(this.filePath), { filename: this.fileName })

      console.log(`Uploading to ${url}`)

      let response = await axios.post(url, formData, {
        headers: {
          ...formData.getHeaders(),
          ...headers,
        },
        timeout: (6 * 60 * 1000),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })

      response = response.data

      const responseUrl = cryptr.encrypt(JSON.stringify(response))

      console.log(`${url}: ${responseUrl}`)

      return response
    } catch (err) {
      console.warn(`${url} error`, err)
      return null
    }
  }

  this.uploadToAnonFile = () => this.uploadTo('https://api.anonfile.com/upload')

  this.uploadToAnon = () => {
    const formData = new FormData()
    formData.append('expires', '6m')

    return this.uploadTo('https://api.anonymousfiles.io', formData)
  }

  this.uploadToFileIo = () => {
    const formData = new FormData()
    formData.append('expires', '1y')

    return this.uploadTo('https://file.io', formData)
  }

  this.uploadToInfura = () => {
    const formData = new FormData()
    formData.append('pin', 'true')

    return this.uploadTo('https://ipfs.infura.io:5001/api/v0/add', formData)
  }

  this.uploadToDreamLink = () => this.uploadTo('http://api.link.dreamnet.tech/add', null, {
    Authorization: `Basic ${process.env.DREAMLINK_TOKEN}`,
  })

  this.upload = async () => {
    if (!fs.existsSync(this.buildPath)) {
      console.log('No build found!', {
        buildPath: this.buildPath
      })

      return
    }

    await this.zip()

    if (!fs.existsSync(this.filePath)) {
      console.log('No release found!', {
        filePath: this.filePath,
        fileName: this.fileName,
      })

      return
    }

    if (!GitHub.isTagRelease) {
      return
    }

    await this.uploadToGithub()
    //await this.uploadToDreamLink()
  }

  this.uploadOthers = async () => {
    if (!fs.existsSync(this.filePath)) {
      console.log('No release found!', {
        filePath: this.filePath,
        fileName: this.fileName,
      })

      return
    }

    const workload = []

    workload.push([
      this.uploadToAnon(),
      this.uploadToFileIo(),
    ])

    await Promise.all(workload)
  }
}

process.on('unhandledRejection', (err) => {
  throw err
})

const release = new Release()

async function main() {
  await release.upload()
  await release.uploadOthers()
}

main()
