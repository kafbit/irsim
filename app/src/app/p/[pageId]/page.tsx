import { PageRoute } from '../../../canvas/canvas'

export default async function Page({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params
  return <PageRoute pageId={pageId} />
}
