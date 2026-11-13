import { redirect } from 'next/navigation';

// Sign-in moved to /groups/sign-in. Old links and bookmarks still arrive.
export default function OldSignInPage() { redirect('/groups/sign-in'); }
