// Shown the moment a page under /groups is opened, while its reads run: a tap is answered at once, not when the data arrives.
export default function GroupsLoading() {
  return <div className="lp-loading" role="status"><p>Opening…</p><i /><i /><i /><i /></div>;
}
