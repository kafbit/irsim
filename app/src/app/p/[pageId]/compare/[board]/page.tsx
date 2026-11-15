import { CompareRoute } from '../../../../../canvas/compare-view'

export default async function Page({ params }: { params: Promise<{ pageId: string; board: string }> }) {
  const { pageId, board } = await params
  return <CompareRoute pageId={pageId} base={board} />
}
