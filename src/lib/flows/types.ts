import { Heart, Image, Mail, MessageCircle, MessageSquare, Mic, Phone, Send, UserPlus, type LucideIcon } from 'lucide-react';
import type { flowSteps, flows, StepType } from '@/db/schema';

/**
 * Tipos do fluxo nativo.
 *
 * O bloco do fluxo é o MESMO passo da cadência da campanha (o motor existente
 * executa os dois), por isso o tipo espelha o `StepType` do schema.
 */
export type FlowStepType = StepType;

/** Lista de tipos de bloco, na ordem da paleta. */
export const FLOW_STEP_TYPES: readonly FlowStepType[] = [
  'react', 'comment', 'invite', 'message', 'email', 'whatsapp', 'voice', 'image', 'call',
];

/** Fluxo: modelo de cadência por operação. */
export type Flow = typeof flows.$inferSelect;

/** Etapa do fluxo: um bloco da sequência, com a ordem em `position`. */
export type FlowStep = typeof flowSteps.$inferSelect;

/** Rótulo e ícone de cada tipo de bloco (mesma linguagem do editor de campanha). */
export const FLOW_STEP_BLOCKS: Record<FlowStepType, { label: string; short: string; icon: LucideIcon }> = {
  react: { label: 'LinkedIn · reagir a post', short: 'Reagir', icon: Heart },
  comment: { label: 'LinkedIn · comentar post', short: 'Comentar', icon: MessageCircle },
  invite: { label: 'LinkedIn · convite', short: 'Convite', icon: UserPlus },
  message: { label: 'LinkedIn · mensagem', short: 'Mensagem', icon: Send },
  email: { label: 'E-mail', short: 'E-mail', icon: Mail },
  whatsapp: { label: 'WhatsApp', short: 'WhatsApp', icon: MessageSquare },
  voice: { label: 'WhatsApp · voz', short: 'Voz', icon: Mic },
  image: { label: 'WhatsApp · imagem/informativo', short: 'Imagem', icon: Image },
  call: { label: 'WhatsApp · ligação (assistida)', short: 'Ligação', icon: Phone },
};
