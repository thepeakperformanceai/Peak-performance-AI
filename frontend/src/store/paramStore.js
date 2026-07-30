
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_PARAMS = [
  {
    key: 'goal',
    label: 'Athlete goal',
    type: 'dropdown',
    options: ['General performance', 'Return from injury', 'Weight loss', 'Pre-season preparation'],
    enabled: true,
    required: false,
  },
  {
    key: 'sessionsPerWeek',
    label: 'Sessions per week',
    type: 'number',
    options: [],
    enabled: true,
    required: false,
  },
  {
    key: 'practitionerNotes',
    label: 'Practitioner notes',
    type: 'text',
    options: [],
    enabled: false,
    required: false,
  },
]

export const useParamStore = create(
  persist(
    (set) => ({
      params: DEFAULT_PARAMS,

      toggleParam: (key) =>
        set((state) => ({
          params: state.params.map((p) =>
            p.key === key ? { ...p, enabled: !p.enabled } : p
          ),
        })),

      addParam: (param) =>
        set((state) => ({ params: [...state.params, param] })),

      updateParam: (key, data) =>
        set((state) => ({
          params: state.params.map((p) =>
            p.key === key ? { ...p, ...data } : p
          ),
        })),

      deleteParam: (key) =>
        set((state) => ({
          params: state.params.filter((p) => p.key !== key),
        })),
    }),
    { name: 'pp-parameters' }
  )
)