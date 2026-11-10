import { z } from 'zod';

export const campaignStepSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(['react', 'comment', 'invite', 'message', 'email', 'whatsapp', 'voice', 'image', 'call']),
  subject: z.string().max(160).optional(),
  mediaUrl: z.string().max(2000).optional(),
  delayDays: z.coerce.number().int().min(0).max(60),
  condition: z.enum(['always', 'accepted']),
  template: z.string().max(1500),
  useAi: z.boolean(),
  name: z.string().trim().max(60).optional(), // rótulo da etapa no mini-mapa do fluxo (RF7)
});
