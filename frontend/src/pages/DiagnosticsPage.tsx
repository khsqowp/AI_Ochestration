import { CheatSheetModal } from '../panels/CheatSheetModal'
import { DiagnosticWorkbench } from '../components/DiagnosticWorkbench'

export function DiagnosticsPage() {
  return <div className="page diag-page"><DiagnosticWorkbench/><CheatSheetModal embedded/></div>
}
