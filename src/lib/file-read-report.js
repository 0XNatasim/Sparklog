// Sends the diagnostic of a picture the phone could not read to the Journal (migration 0112).
// Best-effort: it never throws and never delays the employee's error message.
import { supabase } from "@/supabaseClient";
import { fileDiagnostics, isFileFailure } from "@/lib/evidence-file";

const isInstalled = () => {
  try {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
  } catch {
    return false;
  }
};

export function reportFileReadError(context, file, error) {
  if (!file || !isFileFailure(error)) return;
  try {
    const details = fileDiagnostics(file, error, { installed: isInstalled() });
    Promise.resolve(supabase.rpc("log_file_read_error", { p_context: context, p_details: details }))
      .then((result) => { if (result?.error) console.warn("[file-read-report]", result.error); })
      .catch((reportError) => console.warn("[file-read-report]", reportError));
  } catch (reportError) {
    console.warn("[file-read-report]", reportError);
  }
}
