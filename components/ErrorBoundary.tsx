"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 w-full h-full font-mono text-sm overflow-auto">
          <h2 className="text-xl font-bold mb-4">Something went wrong.</h2>
          <pre className="whitespace-pre-wrap">{this.state.error?.toString()}</pre>
          <pre className="whitespace-pre-wrap mt-4 text-xs opacity-70">{this.state.errorInfo?.componentStack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
