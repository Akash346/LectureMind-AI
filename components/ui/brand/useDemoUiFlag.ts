"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

export function useDemoUiFlag() {
  const searchParams = useSearchParams();
  const [isDemoUi, setIsDemoUi] = React.useState(false);

  React.useEffect(() => {
    const fromQuery = searchParams.get("demo") === "1";
    if (typeof window === "undefined") {
      setIsDemoUi(fromQuery);
      return;
    }

    const fromStorage =
      window.sessionStorage.getItem("lecturemind_demo") === "true" ||
      window.sessionStorage.getItem("lecturemind-demo") === "true";

    if (fromQuery) {
      window.sessionStorage.setItem("lecturemind_demo", "true");
      window.sessionStorage.setItem("lecturemind-demo", "true");
      setIsDemoUi(true);
      return;
    }

    setIsDemoUi(fromStorage);
  }, [searchParams]);

  return isDemoUi;
}
