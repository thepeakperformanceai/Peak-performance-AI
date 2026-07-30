import { useState, useEffect } from 'react'
import { getAllReports, getReport, deleteReport, downloadReportPDF } from '../services/api'
import toast from 'react-hot-toast'
import { useReportStore } from '../store/reportStore'


export default function PastReports({ onNavigate }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const setReport = useReportStore(s => s.setReport)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      const data = await getAllReports()
      setReports(data.reports || [])
    } catch (err) {
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this report?')) return
    try {
      await deleteReport(id)
      setReports(prev => prev.filter(r => r._id !== id))
      toast.success('Report deleted')
    } catch (err) {
      toast.error('Delete failed')
    }
  }

  const handleDownload = async (id, name) => {
    try {
      await downloadReportPDF(id)
    } catch (err) {
      toast.error('Download failed')
    }
  }

  const handleView = async (id) => {
    try {
      const data = await getReport(id)
      setReport(data.report)
      onNavigate('report')
    } catch (err) {
      toast.error('Failed to load report')
    }
  }
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Past Reports</h1>
        <p className="text-sm text-gray-500 mt-1">{reports.length} reports total</p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No reports yet</p>
          <a href="/" className="btn btn-primary text-xs px-4 py-2">+ Create new report</a>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <div key={report._id} className="card flex items-center justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{report.athleteName}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>📅 {report.testDate}</span>
                  <span>🏃 {report.sport}</span>
                  <span>👤 Age {report.age}</span>
                  <span>📝 {new Date(report.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleView(report._id)}
                  className="btn text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200"
                >
                  👁 View
                </button>
                <button
                  onClick={() => handleDownload(report._id, report.athleteName)}
                  className="btn btn-primary text-xs px-3 py-1.5"
                >
                  ⬇ PDF
                </button>
                <button
                  onClick={() => handleDelete(report._id)}
                  className="btn text-xs px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100"
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}