import React, { Suspense, lazy } from "react";
import { PanelLoading } from "@/components/LazyLoading";

// React.lazy with its own Suspense boundary, so a page part can load on demand
// without blanking the page around it.
export function lazyPanel(importer) {
  const Lazy = lazy(importer);
  return function LazyPanel(props) {
    return (
      <Suspense fallback={<PanelLoading />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
