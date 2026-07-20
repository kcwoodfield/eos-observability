export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4100'
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4100/stream'
export const MAX_EVENTS_TO_DISPLAY = Number(import.meta.env.VITE_MAX_EVENTS_TO_DISPLAY ?? 200)
