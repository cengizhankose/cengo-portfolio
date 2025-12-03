import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './index.css'
import reportWebVitals from './reportWebVitals'

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

reportWebVitals()