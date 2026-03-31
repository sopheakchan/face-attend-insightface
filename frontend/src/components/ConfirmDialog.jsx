'useclient'

export default function ConfirmDialog({ open, onConfirm, onCancel, isLoading }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-full max-w-sm mx-4 p-5">
        <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Clear today's attendance?</h2>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          This will remove all check-ins and check-outs for today. Attendance history for older dates will not be affected.
        </p>
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700 mb-4">
          This action cannot be undone.
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="h-8 px-3 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="h-8 px-3 text-xs font-semibold rounded-md border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-60"
          >
            {isLoading ? "Clearing..." : "Clear today"}
          </button>
        </div>
      </div>
    </div>
  );
}