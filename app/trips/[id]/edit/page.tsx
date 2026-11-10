import { TripComposer } from '@/components/TripComposer';
export const metadata = { title: 'Edit trip · Loop' };
export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripComposer mode="edit" id={id} />;
}
