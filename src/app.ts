import React from 'react'
import { initCloud } from './modules/cloud'
import './app.scss'

export default function App(props: { children: React.ReactNode }) {
  initCloud()

  return props.children
}
