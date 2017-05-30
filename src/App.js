// const electron = window.require('electron');
// const ipcRenderer  = electron.ipcRenderer;

import React, { Component } from 'react'
import dragDrop from 'drag-drop'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import injectTapEventPlugin from 'react-tap-event-plugin'
injectTapEventPlugin()
import timeClient from './TimeDiffClient'
import control from './Control'
import Store from './Store'
import Settings from './Settings'

import TextField from 'material-ui/TextField'
import {RaisedButton} from 'material-ui'
import IconButton from 'material-ui/IconButton'
import Slider from 'material-ui/Slider'
import {List, ListItem} from 'material-ui/List'
import MusicNoteIcon from 'react-material-icons/icons/image/music-note'
import PeopleIcon from 'react-material-icons/icons/social/people'
import SyncIcon from 'react-material-icons/icons/notification/sync'
import songs from './songs'
import quotes from './quotes'
import logo from './logo.svg'
import Background from './Background'
import './App.css'

class App extends Component {
  constructor(props) {
    super(props)
    this.store = new Store('app')
    this.ip = process.env.REACT_APP_IP
    
    this.state = {
      status: this.getStatusMessage(),
      controlsClass: 'hidden',
      settingsModalOpen: false,
      timeServer: `${this.ip}:8001`,
      controlServer: `${this.ip}:9090`,
      youtubeAudioServer: `${this.ip}:4000`,
      maxRequests: 150,
      joinedClients: 1,
      youtubeId: '',
      volume: 0.5,
      preloadTime: 5000,
      timeDiff: this.store.get('timeDiff') || '',
      offset: this.store.get('offset') || 0,
      songs: this.store.get('songs') || songs,
      backgroundStyle: {opacity: 0}
    }
    this.selectedSong = this.state.songs[0]
    this.selectedSongIndex = null
    this.setAudioFile(this.state.songs[0].file)
    this.hasControls = false
    this.playDelay = 5000 // in ms
    this.backwardsOffset = 1 // in ms
    this.forwardOffset = 100 // in ms
    this.isMaster = false
    this.isServer = location.href.match('localhost')

    window.goto = (value) => {
      this.goto(value)
    }
  }

  onKey (event) {
    // Left arrow.
    if (event.keyCode === 37) {
      console.log('left')
      const offset = this.state.offset - this.backwardsOffset
      this.setState({offset})
      this.store.set('offset', this.state.offset)
      console.log(`
        - OFFSET ${this.backwardsOffset}ms --> ${this.state.offset}ms
        Time DIFF: ${this.state.timeDiff + this.state.offset}ms
      `)

      // If we're playing audio live adjust it.
      if (this.sound.playing()) {
        const currentPlayTime = this.sound.seek()
        const offsetTime = currentPlayTime - this.backwardsOffset / 1000
        this.sound.seek(offsetTime)
        console.log(`Playing @${currentPlayTime}, move backwards to ${offsetTime}`)
      }
      return
    }

    // Right arrow.
    if (event.keyCode === 39) {
      const offset = this.state.offset + this.backwardsOffset
      this.setState({offset})
      this.store.set('offset', this.state.offset)
      console.log(`
        + OFFSET ${this.forwardOffset}ms --> ${this.state.offset}ms
        Time DIFF: ${this.state.timeDiff + this.state.offset}ms
      `)

      // If we're playing audio live adjust it.
      if (this.sound.playing()) {
        const currentPlayTime = this.sound.seek()
        const offsetTime = currentPlayTime + this.forwardOffset / 1000
        this.sound.seek(offsetTime)
        console.log(`Playing @${currentPlayTime}, move forward to ${offsetTime}`)
      }
      return
    }
  }

  getRandomQuote () {
    const index = Math.floor(Math.random() * (quotes.length))
    const quote = quotes[index]
    console.log('-- RANDOM QUOTE:', quote)
    return (
      <span>
        <i>{quote.message}</i> <b>--{quote.author}</b>
      </span>
    )
  }

  getStatusMessage (status = 'sync', message = 'Unable to connect to time server.') {
    const statusMessages = {
      sync: (
        <p className="App-intro">
          <b>Synchronizing...</b>
        </p>
      ),
      ok: (
        <p className="App-intro">
          <b>Synchronized</b> successfully!
        </p>
      ),
      alreadySync: (
        <p className="App-intro">
          Using saved <b>synchronization</b>.
        </p>
      ),
      error: (
        <p className="App-intro">
          <b>ERROR:</b> {message}
        </p>
      ),
      willPlay: (
        <p className="App-intro">
          <b>Wait for:</b> {message}
        </p>
      ),
      playing: (
        <p className="App-intro">
          <b>Playing:</b> {message}
        </p>
      ),
      preloading: (
        <p className="App-intro">
          <b>Preloading:</b> {message}
        </p>
      ),
      stop: (
        <p className="App-intro">
          {message}
        </p>
      ),
      selectedSong: (
        <p className="App-intro">
          <b>Selected Song:</b> {message}
        </p>
      )
    }

    return statusMessages[status]
  }

  setStatus (status, message) {
    this.setState({
      status: this.getStatusMessage(status, message)
    })
  }

  componentDidMount() {
    this.synchronize()
    this.setDropArea()

    // Set key events.
    document.querySelector('body')
      .addEventListener('keydown', (event) => this.onKey(event))
  }

  componentWillUnmount() {
    document.querySelector('body')
      .removeEventListener('keydown', (event) => this.onKey(event)) 
  }

  setDropArea () {
    dragDrop('#dropTarget', (files, pos) => {
      console.log('Here are the dropped files', files)

      const file = files[0]
      const reader = new FileReader()
      reader.onload = (e) => {
        // reader.result;
      }
      reader.readAsArrayBuffer(file)
      const url = URL.createObjectURL(file)

      console.log('AUDIO URL:', url)
      this.selectSong({
        file: url,
        title: null,
        author: null
      })
    })
  }

  synchronize () {
    // Avoid synchronizing if we already did.
    if (this.state.timeDiff !== '') {
      this.setStatus('alreadySync')
      this.initControl()
      return
    }

    console.log('SYNCHRONIZING...')
    this.setStatus('sync')

    timeClient
      .connect(`ws://${this.state.timeServer}`)
      .init(this.state.maxRequests)
      .onDiff((diff) => {
        console.log('-'.repeat(80))
        console.log('--- GOT CLOCKS DIFF:', diff)
        console.log('-'.repeat(80))
        this.setStatus('ok')
        this.setState({timeDiff: diff})
        this.store.set('timeDiff', this.state.timeDiff)
        this.initControl()
      })
      .onError((error) => {
        console.log('--- WS ERROR:', error)
        this.setStatus('error')
      })
  }

  getSongStatus (song) {
    return `
      "${this.selectedSong.title || this.selectedSong.file}" 
      by ${this.selectedSong.author || 'Unknown'}
    `
  }

  initControl () {
    control
      .connect(`ws://${this.state.controlServer}`)
      .onError((error) => {
        console.log('ERROR: Unable to connect to CONTROL server.')
      })
      .onStop(() => {
        this.sound.stop()
        this.hideBackground()
        this.setStatus('stop', this.getRandomQuote())
      })
      .onPause(() => {
        this.sound.pause()
      })
      .onVolume((data) => {
        this.setVolume(data.value)
      })
      .onSelectSong((data) => {
        console.log('CONTROLLER selected a SONG:', data)
        this.onSelectSong(data.value)
      })
      .onReload((data) => {
        console.log('RELOADING...', data)
        this.doReload(data)
      })
      .onResetSync((data) => {
        console.log('RESET SYNC...', data)
        this.doResetSync(data)
      })
      .onJoin((data) => {
        this.setState({joinedClients: this.state.joinedClients + 1})

        console.log(`-- is master? ${this.isMaster} / is playing? ${this.sound.playing()}`)
        if (!this.isMaster) return
        if (!this.sound.playing()) return

        // Send future playback position to client for it
        // to join in sync.
        console.log('MASTER answering JOIN request', data)
        const delay = this.playDelay
        const futureTime = this.sound.seek() + delay / 1000
        const localTime = (new Date()).getTime()
        control.joinAt({
          uuid: data.uuid,
          time: futureTime,
          song: this.selectedSong,
          volume: this.getVolume(),
          startAt: localTime + this.state.timeDiff + delay
        })
      })
      .onPlay((data) => {
        const localTime = (new Date()).getTime()
        const startAt = data.startAt + this.state.timeDiff
        const delay = startAt - localTime + this.state.offset
        console.log('GOT PLAY, start at:', startAt)
        console.log(`START IN: ${delay} ms`)
        this.setStatus('willPlay', this.getSongStatus(this.selectedSong))
        setTimeout(() => {
          this.setStatus('preloading', this.getSongStatus(this.selectedSong))
          this.forceFillPlaybackBuffer(this.state.preloadTime, () => {
            console.log('PLAY!')
            this.sound.play()
            this.reloadBackground()
            this.setStatus('playing', this.getSongStatus(this.selectedSong))

            const isPlaying = this.sound.playing()
            console.log('Started playing?', isPlaying)
          })
        }, parseInt(delay, 10))
      })
      .onJoinAt((data) => {
        console.log('=== JOIN AT', data)
        this.onSelectSong(data)
        console.log('SET selected song', data.song)

        const localTime = (new Date()).getTime()
        const startAt = data.startAt + this.state.timeDiff
        const delay = startAt - localTime + this.state.offset

        console.log(`start in ${delay} ms`)
        setTimeout(() => {
          console.log('PLAY!')
          this.sound.seek(data.time)
          this.setVolume(data.vol)
          this.sound.play()
          this.reloadBackground()
          this.setStatus('playing', this.getSongStatus(this.selectedSong))

          const isPlaying = this.sound.playing()
          console.log('Started playing?', isPlaying)
        }, parseInt(delay, 10))

        this.setStatus('preloading', this.getSongStatus(this.selectedSong))
        this.forceFillPlaybackBuffer(1000)
      })
      .onDisconnect((data) => {
        console.log('DISCONNECTED CLIENT', data)
        const joinedClients = this.state.joinedClients - 1
        this.setState({joinedClients})
      })
  }

  play () {
    const startAt = (new Date()).getTime() + this.playDelay
    control.play({startAt})
    this.isMaster = true

    this.setStatus('willPlay', this.getSongStatus(this.selectedSong))
    const delay = this.state.timeDiff + this.playDelay + this.state.offset
    setTimeout(() => {
      this.setStatus('preloading', this.getSongStatus(this.selectedSong))
      this.forceFillPlaybackBuffer(this.state.preloadTime, () => {
        this.sound.play()
        this.reloadBackground()
        this.setStatus('playing', this.getSongStatus(this.selectedSong))
        console.log('PLAY!')

        const isPlaying = this.sound.playing()
        console.log('Started playing?', isPlaying)
      })
    }, parseInt(delay, 10))
  }

  forceFillPlaybackBuffer (preloadTime, callback) {
    const vol = this.getVolume()
    this.setVolume(0)
    this.sound.play()

    setTimeout(() => {
      this.sound.stop()
      this.setVolume(vol)

      if (typeof callback !== 'function') return
      callback()
    }, preloadTime)
  }

  stop () {
    control.stop()
    this.sound.stop()
    this.setStatus('stop', this.getRandomQuote())
    this.hideBackground()
  }

  pause () {
    control.pause()
    this.sound.pause()
  }

  volume (value) {
    control.volume({value})
    this.setState({volume: value})
    this.setVolume(value)
  }

  setVolume (value) {
    this.sound.volume(value)
  }

  getVolume () {
    return this.sound.volume()
  }

  /**
   * Reloads all clients.
   */
  reload () {
    control.reload()
    this.doReload()
  }

  doReload (data) {
    window.location.reload()
  }

  resetSync () {
    control.resetSync()
    this.doResetSync()
  }

  doResetSync () {
    console.log('Reset Sync')
    this.store.set('timeDiff', '')
    this.store.set('offset', 0)
    this.doReload()
  }

  selectSong (song, index) {
    console.log(`SELECTED SONG ${index}: `, song)
    control.selectSong({value: {song, volume: this.getVolume()}})
    this.setAudioFile(song.file)
    this.selectedSong = song
    this.selectedSongIndex = index
    this.setStatus('selectedSong', this.getSongStatus(this.selectedSong))
  }

  onSelectSong ({song, volume}) {
    this.setAudioFile(song.file)
    this.setVolume(volume)
    this.selectedSong = song
    this.setStatus('selectedSong', this.getSongStatus(this.selectedSong)) 
  }

  goto (seconds) {
    this.sound.seek(seconds)
  }

  playFirst () {
    this.selectSong(this.state.songs[0], 0)
    this.play()
    return
  }

  next () {
    const totalSongs = this.state.songs.length || 0

    // Only one song.
    if (totalSongs === 0) {
      console.log('NEXT: only one, play first')
      this.playFirst()
      return
    }

    // End of list.
    if (this.selectedSongIndex >= totalSongs + 1) {
      console.log('NEXT: last song, play first')
      this.playFirst()
      return
    }

    const index = this.selectedSongIndex + 1
    const song = this.state.songs[index]
    console.log(`NEXT: index ${index} / total: ${totalSongs}`, song)
    this.selectSong(song, index)
    this.play() 
  }

  setAudioFile (file) {
    // Ensure there's only one song playing at a time.
    if (this.sound) {
      this.sound.unload()
    }

    this.sound = new Howl({ // eslint-disable-line
      src: [file],
      volume: this.state.volume,
      format: 'mp3',
      autoSuspend: false,
      html5: true
    })

    this.sound.on('end', () => {
      console.log('Audio finished playing.')
      this.next()
    })
  }

  showHideControls () {
    if (!this.isServer) return console.log('Nice rotating logo right? :p')
    if (this.hasControls) {
      this.setState({
        controlsClass: 'hidden'
      })
      this.hasControls = false
      return
    }

    this.setState({
      controlsClass: ''
    })
    this.hasControls = true
  }

  getSongsList () {
    const songs = this.state.songs.map((song, index) => {
      return (
        <ListItem
          primaryText={`${song.title} by ${song.author}`}
          leftIcon={<MusicNoteIcon />}
          onClick={() => this.selectSong(song, index)}
        />
      )
    })

    return (
      <List>
        {songs}
      </List>
    )
  }

  loadFromYoutube (videoId) {
    console.log('Load from YOUTUBE:', videoId)
    this.setState({youtubeId: videoId})

    const song = {
      author: 'TODO',
      title: 'YouTube Song',
      file: `//${this.state.youtubeAudioServer}/${videoId}`
    }
    const songs = this.state.songs
    songs.push(song)
    this.setState({songs})
  }

  onSettingsChange (change) {
    console.log(`SETTINGS CHANGE:`, change)
    this.setState(change)
  }

  getSyncButton () {
    if (this.isServer) return

    return (
      <IconButton
        className='top-right'
        tooltip="Re-Sync"
        onClick={() => this.doResetSync()}
      >
        <SyncIcon className='icon-button' />
      </IconButton>
    )
  }

  getSettingsButton () {
    if (!this.isServer) return

    return (
      <Settings
        timeServer={this.state.timeServer}
        controlServer={this.state.controlServer}
        youtubeAudioServer={this.state.youtubeAudioServer}
        maxRequests={this.state.maxRequests}
        preloadTime={this.state.preloadTime}
        timeDiff={this.state.timeDiff}
        offset={this.state.offset}
        resetSync={() => this.doResetSync()}
        onSettingsChange={(change) => this.onSettingsChange(change)}
      />
    )
  }

  getConnectedClients () {
    if (!this.isServer) return

    return (
      <div
        className='top-left text-info'
        style={{color: 'gray'}}
      >
        <span>{this.state.joinedClients}</span>
        <PeopleIcon style={{color: 'gray'}} />
      </div>
    )
  }

  showBackground () {
    this.setState({backgroundStyle: {display: 'block'}})
  }

  hideBackground () {
    this.setState({backgroundStyle: {display: 'none'}})
  }

  reloadBackground () {
    this.setState({backgroundStyle: {display: 'none'}})
    setTimeout(() => {
      this.setState({backgroundStyle: {display: 'block', opacity: 1}})
    })
  }

  getBackground (show = true) {
    if (!show) {
      return (<div></div>)
    }

    return (
      <Background />
    )
  }

  render() {
    return (
      <MuiThemeProvider>
        <div className="App" id="dropTarget">
          <div className="App-header">
            <img src={logo} className="App-logo" alt="logo" onClick={() => this.showHideControls() } />
            <h2>Audio Sync</h2>
          </div>

          <div style={this.state.backgroundStyle} className="animate">
            <Background />
          </div>
          
          {this.state.status}
          {this.getSyncButton()}
          {this.getConnectedClients()}
          {this.getSettingsButton()}

          <div className="App-content">
            <div className={this.state.controlsClass + ' controls'}>
              <RaisedButton onClick={() => this.play()}>Play</RaisedButton>
              <RaisedButton onClick={() => this.stop()}>Stop</RaisedButton>
              <RaisedButton onClick={() => this.reload()}>Reload</RaisedButton>
              <RaisedButton onClick={() => this.resetSync()}>Re-Sync</RaisedButton>

              <Slider defaultValue={this.state.volume} onChange={(event, value) => this.volume(value)} />

              <div className="youtube-container">
                <TextField
                  style={{width: '100%'}}
                  floatingLabelText="YouTube Video ID / Add to queue"
                  value={this.state.youtubeId}
                  onChange={(event, value) => this.loadFromYoutube(value)}
                />
              </div>

              <div className="songs">
                {this.getSongsList()}
              </div>
            </div>
          </div>
        </div>
      </MuiThemeProvider>
    )
  }
}

export default App
