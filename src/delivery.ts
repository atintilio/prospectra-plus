export type DeliveryResponse = { ok?: boolean; queued?: boolean; receipt?: { providerMessageId?: string; status?: string } };
export function deliveryOutcome(response: DeliveryResponse): 'sent' | 'queued' | 'unknown' {
  if (response.queued === true) return 'queued';
  if (response.receipt?.status === 'sent' && response.receipt.providerMessageId) return 'sent';
  return 'unknown';
}
