'use client';

import { CalendarCheck, CalendarX2 } from 'lucide-react';
import { useActionState } from 'react';
import { FormMessage, Submit } from '@/components/form';
import type { PublicState } from './actions';
import { publicCancelAction, publicConfirmAction } from './actions';

export function PublicMeetingControls({ publicId, cancelled }: { publicId: string; cancelled: boolean }) {
  const [confirmState, confirmAction] = useActionState<PublicState, FormData>(publicConfirmAction, undefined);
  const [cancelState, cancelAction] = useActionState<PublicState, FormData>(publicCancelAction, undefined);
  if (cancelled) return <p className="card p-4 text-center text-sm text-muted">Esta reunião foi cancelada.</p>;
  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <form action={confirmAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <Submit className="btn-primary w-full justify-center" pendingText="Confirmando…"><CalendarCheck className="mr-1 inline h-4 w-4" /> Confirmar presença</Submit>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <Submit className="btn-outline w-full justify-center text-danger" pendingText="Cancelando…"><CalendarX2 className="mr-1 inline h-4 w-4" /> Cancelar</Submit>
        </form>
      </div>
      <FormMessage state={confirmState?.error ? confirmState : cancelState?.error ? cancelState : confirmState?.ok ? confirmState : cancelState?.ok ? cancelState : confirmState} />
    </div>
  );
}
