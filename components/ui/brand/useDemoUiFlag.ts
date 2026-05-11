"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

export function useDemoUiFlag() {
  const searchParams = useSearchParams();
  const [isDemoUi, setIsDemoUi] = React.useState(false);

  React.useEffect(() => {
    const fromQuery = searchParams.get("demo") === "1";
    const fromStorage =
      window.sessionStorage.getItem("lecturemind_demo") === "true";

    if (fromQuery) {
      window.sessionStorage.setItem("lecturemind_demo", "true");
      setIsDemoUi(true);
      return;
    }

    setIsDemoUi(fromStorage);
  }, [searchParams]);

  return isDemoUi;
}
