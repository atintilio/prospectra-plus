'use client';

import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

export function Submit({ children, className = 'btn-primary w-full', pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role="status" className={`rounded-lg px-3 py-2 text-sm ${state.error ? 'bg-red-50 text-danger' : 'bg-success-soft text-success'}`}>
      {state.error ?? state.ok}
    </p>
  );
}
