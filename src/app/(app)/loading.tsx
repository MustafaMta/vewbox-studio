export default function Loading() {
  return <div aria-busy className="space-y-4"><div className="skeleton h-8 w-64" /><div className="skeleton h-4 w-96" /><div className="grid-tiles mt-8">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-video" />)}</div></div>;
}
