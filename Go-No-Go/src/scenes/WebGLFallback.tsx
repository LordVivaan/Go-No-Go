import { AlertTriangle, MonitorOff } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode, useState } from 'react';
import { isWebGLAvailable } from './webglUtils';

interface SceneBoundaryProps {
  title: string;
  subtitle: string;
  heightClass?: string;
  className?: string;
  children: ReactNode;
}

interface SceneBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class WebGLErrorBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  constructor(props: SceneBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): SceneBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error captured cleanly for fallback panel rendering
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={`flex w-full ${this.props.heightClass ?? 'h-[420px]'} flex-col items-center justify-center rounded-2xl border border-[#F1F5FA]/15 bg-[#0D1422] p-6 text-center ${this.props.className ?? ''}`}
        >
          <AlertTriangle className="h-8 w-8 text-[#FFB547]" />
          <h3 className="mt-3 font-display text-sm font-bold text-[#F1F5FA]">
            {this.props.title} — Telemetry 2D Fallback
          </h3>
          <p className="mt-1 max-w-md text-xs text-[#8E9BAD]">
            {this.props.subtitle} ({this.state.errorMessage || 'WebGL context unavailable'})
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SceneCanvasGuard({
  title,
  subtitle,
  heightClass = 'h-[420px]',
  className = '',
  children,
}: SceneBoundaryProps) {
  const [webglSupported] = useState(() => isWebGLAvailable());

  if (!webglSupported) {
    return (
      <div
        className={`flex w-full ${heightClass} flex-col items-center justify-center rounded-2xl border border-[#F1F5FA]/15 bg-[#0D1422] p-6 text-center ${className}`}
      >
        <MonitorOff className="h-8 w-8 text-[#42D9F5]" />
        <h3 className="mt-3 font-display text-sm font-bold text-[#F1F5FA]">
          {title} (2D Fallback Mode)
        </h3>
        <p className="mt-1 max-w-md text-xs text-[#8E9BAD]">{subtitle}</p>
        <span className="mt-3 rounded-lg border border-[#F1F5FA]/15 bg-[#080B12] px-3 py-1 font-mono text-[11px] text-[#8E9BAD]">
          WebGL hardware acceleration unavailable in this browser environment
        </span>
      </div>
    );
  }

  return (
    <WebGLErrorBoundary
      title={title}
      subtitle={subtitle}
      heightClass={heightClass}
      className={className}
    >
      {children}
    </WebGLErrorBoundary>
  );
}
