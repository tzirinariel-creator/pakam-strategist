"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PlannerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("PlannerErrorBoundary caught:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Detect locale from the <html lang> attribute (set by next-intl)
      const isHe =
        typeof document !== "undefined"
          ? document.documentElement.lang === "he"
          : true;

      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground/70">
              {isHe ? "משהו השתבש" : "Something went wrong"}
            </h3>
            <p className="mt-1 text-xs text-foreground/40 max-w-xs">
              {isHe
                ? "אל דאגה — הנתונים שלכם שמורים. נסו לרענן."
                : "Don\u2019t worry \u2014 your data is saved. Try refreshing."}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/20 hover:text-foreground/90"
          >
            <RefreshCcw className="h-4 w-4" />
            {isHe ? "נסו שוב" : "Try again"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
