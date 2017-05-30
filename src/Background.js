import React, { Component } from 'react'

export default class Background extends Component {
  constructor (props) {
    super(props)

    this.state = {
      src: props.src || './gandalf.gif'
    }
  }

  render () {
    return (
      <div style={{
        background: `url(${this.state.src}) 50% 0% / cover no-repeat`,
        width: '100%', 
        height: '100%', 
        position: 'absolute'
      }}></div>
    )
  }
}
