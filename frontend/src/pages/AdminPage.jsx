import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { getExercises, addExercise, updateExercise, deleteExercise } from '../services/api'
import { useParamStore } from '../store/paramStore'

const TABS = [
  { id: 'exercises',  label: '💪 Exercise library' },
  { id: 'parameters', label: '⚙️ Form parameters' },
]

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('exercises')

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'exercises'  && <ExerciseLibrary />}
      {activeTab === 'parameters' && <FormParameters />}
    </div>
  )
}

/* ─── EXERCISE LIBRARY ─────────────────────────────────────── */
function ExerciseLibrary() {
  const [exercises, setExercises] = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState({ name: '', description: '', targets: '' })

useEffect(() => {
  getExercises()
    .then(data => setExercises(data.exercises || []))
    .catch(() => toast.error('Could not load exercises.'))
    .finally(() => setLoading(false))
}, [])

  const filtered = exercises.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.targets.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', description: '', targets: '' })
    setShowForm(true)
  }

  const openEdit = ex => {
    setEditing(ex._id)
    setForm({ name: ex.name, description: ex.description, targets: ex.targets })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Exercise name is required.'); return }
    try {
      if (editing) {
        const updated = await updateExercise(editing, form)
        setExercises(prev => prev.map(ex => ex._id === editing ? updated : ex))
        toast.success('Exercise updated.')
      } else {
        const created = await addExercise(form)
        setExercises(prev => [...prev, created])
        toast.success('Exercise added.')
      }
      setShowForm(false)
    } catch {
      toast.error('Save failed. Please try again.')
    }
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this exercise?')) return
    try {
      await deleteExercise(id)
      setExercises(prev => prev.filter(ex => ex._id !== id))
      toast.success('Exercise deleted.')
    } catch {
      toast.error('Delete failed.')
    }
  }

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900">Exercise library</h2>
        <button onClick={openAdd} className="btn btn-primary text-xs px-3 py-1.5">+ Add</button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-gray-400 text-sm">🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
          placeholder="Search exercises or targets…"
        />
      </div>

      {showForm && (
        <div className="p-4 bg-pp-orangeLite border border-pp-orangeMid rounded-xl space-y-3">
          <p className="text-xs font-medium text-pp-orange">{editing ? 'Edit exercise' : 'Add new exercise'}</p>
          <div className="space-y-2">
            <input className="inp text-xs" placeholder="Exercise name *"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <input className="inp text-xs" placeholder="Short description"
              value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <input className="inp text-xs" placeholder="Targets (e.g. Core, Glutes, Hips)"
              value={form.targets} onChange={e => setForm(p => ({ ...p, targets: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn text-xs px-3 py-1">Cancel</button>
            <button onClick={handleSave} className="btn btn-primary text-xs px-3 py-1">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[460px] overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">No exercises found</div>
        ) : filtered.map(ex => (
          <div key={ex._id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-pp-orangeLite flex items-center justify-center text-lg flex-shrink-0">💪</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{ex.name}</p>
              <p className="text-xs text-gray-500 truncate">{ex.targets}</p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => openEdit(ex)}
                className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-xs"
                aria-label="Edit">✏️</button>
              <button onClick={() => handleDelete(ex._id)}
                className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-red-50 flex items-center justify-center text-xs"
                aria-label="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">{exercises.length} exercises total</p>
    </div>
  )
}

/* ─── FORM PARAMETERS ──────────────────────────────────────── */
const EMPTY_FORM = { label: '', type: 'text', options: '', required: false }

function FormParameters() {
  const { params, toggleParam, addParam, updateParam, deleteParam } = useParamStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = param => {
    setEditing(param.key)
    setForm({
      label:    param.label,
      type:     param.type,
      options:  param.options?.join(', ') || '',
      required: param.required,
    })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.label.trim()) { toast.error('Label is required.'); return }

    const parsed = {
      label:    form.label.trim(),
      type:     form.type,
      options:  form.type === 'dropdown'
        ? form.options.split(',').map(o => o.trim()).filter(Boolean)
        : [],
      required: form.required,
      enabled:  true,
    }

    if (editing) {
      updateParam(editing, parsed)
      toast.success('Parameter updated.')
    } else {
      // generate a unique key from the label
      const key = form.label.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now()
      addParam({ key, ...parsed })
      toast.success('Parameter added.')
    }
    setShowForm(false)
  }

  const handleDelete = key => {
    if (!window.confirm('Delete this parameter?')) return
    deleteParam(key)
    toast.success('Parameter deleted.')
  }

  const typeLabel = { text: 'Free text', number: 'Number', dropdown: 'Dropdown' }

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Form parameters</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Enabled parameters appear in the athlete form on the upload page.
          </p>
        </div>
        <button onClick={openAdd} className="btn btn-primary text-xs px-3 py-1.5">+ Add field</button>
      </div>

      {/* Add / edit form */}
      {showForm && (
        <div className="p-4 bg-pp-orangeLite border border-pp-orangeMid rounded-xl space-y-3">
          <p className="text-xs font-medium text-pp-orange">{editing ? 'Edit parameter' : 'Add new parameter'}</p>
          <div className="grid grid-cols-2 gap-3">

            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-gray-500">Field label *</label>
              <input className="inp text-sm" placeholder="e.g. Athlete goal"
                value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Field type</label>
              <select className="inp text-sm"
                value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="text">Free text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
              </select>
            </div>

            <div className="space-y-1 flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.required}
                  onChange={e => setForm(p => ({ ...p, required: e.target.checked }))}
                  className="w-4 h-4 accent-pp-orange" />
                <span className="text-sm text-gray-600">Required field</span>
              </label>
            </div>

            {form.type === 'dropdown' && (
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-gray-500">Options (comma separated)</label>
                <input className="inp text-sm"
                  placeholder="e.g. General performance, Return from injury, Weight loss"
                  value={form.options}
                  onChange={e => setForm(p => ({ ...p, options: e.target.value }))} />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setShowForm(false)} className="btn text-xs px-3 py-1.5">Cancel</button>
            <button onClick={handleSave} className="btn btn-primary text-xs px-3 py-1.5">Save field</button>
          </div>
        </div>
      )}

      {/* Parameter list */}
      <div className="space-y-2">
        {params.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">No parameters yet. Click + Add field.</div>
        ) : params.map(param => (
          <div key={param.key}
            className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
              param.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
            }`}
          >
            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${param.enabled ? 'bg-pp-orange' : 'bg-gray-300'}`} />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${param.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                  {param.label}
                </p>
                {param.required && (
                  <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Required</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {typeLabel[param.type]}
                {param.type === 'dropdown' && param.options?.length > 0 &&
                  ` — ${param.options.join(', ')}`}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => openEdit(param)}
                className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-xs"
                aria-label="Edit parameter">✏️</button>
              <button onClick={() => handleDelete(param.key)}
                className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-red-50 flex items-center justify-center text-xs"
                aria-label="Delete parameter">🗑</button>

              {/* Toggle */}
              <button
                onClick={() => toggleParam(param.key)}
                aria-label={param.enabled ? 'Disable parameter' : 'Enable parameter'}
                className={`relative w-10 rounded-full transition-colors flex-shrink-0 ${param.enabled ? 'bg-pp-orange' : 'bg-gray-300'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${param.enabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        {params.filter(p => p.enabled).length} of {params.length} parameters active
      </p>
    </div>
  )
}