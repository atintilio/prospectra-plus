import { expect, test } from 'vitest';
import { campaignStepSchema } from '@/lib/campaign-step';
test('multichannel steps preserve email subject and media URL while rejecting unknown channels', () => {
 const base = { id: 's1', delayDays: 0, condition: 'always', template: 'Olá', useAi: true };
 for (const type of ['email', 'whatsapp', 'voice', 'image', 'call']) expect(campaignStepSchema.parse({ ...base, type }).type).toBe(type);
 expect(campaignStepSchema.parse({ ...base, type: 'email', subject: 'PERSE' }).subject).toBe('PERSE');
 expect(campaignStepSchema.parse({ ...base, type: 'image', mediaUrl: 'https://example.com/a.pdf' }).mediaUrl).toBe('https://example.com/a.pdf');
 expect(campaignStepSchema.safeParse({ ...base, type: 'unknown' }).success).toBe(false);
});
