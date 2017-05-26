import control from '../Control'

export function selectSong (song) {
  return {type: 'selectedSong', song}
}
