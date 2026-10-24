import {getApiMode} from '@/api/config'
/** Staged deployment: old normal backends keep their existing real HTTP UI. */
export const taskCompanionEnabled = getApiMode()==='http' && import.meta.env.VITE_TASK_COMPANION==='true'
