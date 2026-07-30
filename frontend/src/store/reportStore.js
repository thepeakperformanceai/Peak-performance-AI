import { create } from 'zustand'

export const useReportStore = create(set => ({
  report:    null,
  setReport: report => set({ report }),
  clearReport: ()   => set({ report: null }),
}))
