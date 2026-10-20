export type Appearance = 'light' | 'dark' | 'system'
const key = 'nebula-appearance'
let preference: Appearance = 'system'
const system = window.matchMedia('(prefers-color-scheme: dark)')
const valid = (value: unknown): value is Appearance => value === 'light' || value === 'dark' || value === 'system'
function apply() {
  document.documentElement.dataset.theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference
}
system.addEventListener('change', () => { if (preference === 'system') apply() })
export async function initializeAppearance() {
  try {
    const value = window.nebula ? await window.nebula.appearance() : localStorage.getItem(key)
    if (valid(value)) preference = value
  } catch { /* System appearance remains usable when local preferences cannot be read. */ }
  apply()
}
export const getAppearance = () => preference
export async function setAppearance(value: Appearance) {
  if (window.nebula) await window.nebula.setAppearance(value)
  else localStorage.setItem(key, value)
  preference = value
  apply()
}
