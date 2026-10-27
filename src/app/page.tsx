import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/auth';

export default async function Home() {
  redirect((await getCtx()) ? '/painel' : '/login');
}
