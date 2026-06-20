import React from "react";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/lib/use-t";

export default function Testing() {
  const t = useT();

  return (
    <AppShell>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{t("nav.testing")}</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
