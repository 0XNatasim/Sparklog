import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";

// Catches a render error so one broken screen no longer blanks the whole app.
// The employee's in-progress entry is safe: EmployeeForm autosaves it to IndexedDB
// and restores it after the reload offered here. `resetKey` (the route) clears the
// error when the user navigates elsewhere.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[SparkLog] render error", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.reset();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const Fallback = this.props.fallback || ErrorFallback;
    return <Fallback reset={this.reset} />;
  }
}

// Route/panel fallback (inside the language provider).
export function ErrorFallback({ reset }) {
  const t = useT();
  return (
    <div role="alert" className="mx-auto my-6 max-w-md space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
        {t("errors.boundary.title")}
      </div>
      <p className="text-foreground">{t("errors.boundary.body")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={() => window.location.reload()}>{t("errors.boundary.reload")}</Button>
        <Button type="button" variant="outline" className="h-11" onClick={reset}>{t("common.retry")}</Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          onClick={() => { window.location.hash = "#/"; reset(); }}
        >
          {t("errors.boundary.home")}
        </Button>
      </div>
    </div>
  );
}

// Last-resort fallback above every provider: no translations or theme state are
// guaranteed here, so it is static and bilingual.
export function RootErrorFallback() {
  return (
    <div role="alert" className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
      <div className="max-w-sm space-y-3">
        <p className="text-lg font-bold">SparkLog</p>
        <p>Un problème est survenu. Vos saisies en cours sont conservées sur cet appareil.</p>
        <p className="text-sm text-muted-foreground">Something went wrong. Your unsaved entry is kept on this device.</p>
        <Button type="button" className="h-11" onClick={() => window.location.reload()}>Recharger / Reload</Button>
      </div>
    </div>
  );
}
