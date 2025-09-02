import GraphClient from "./GraphClient";

export default async function GraphPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <GraphClient siteId={siteId} />;
}


