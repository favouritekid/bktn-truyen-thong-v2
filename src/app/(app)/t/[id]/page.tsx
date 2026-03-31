import { redirect } from 'next/navigation';

export default async function TaskRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/kanban?task=${encodeURIComponent(id)}`);
}
