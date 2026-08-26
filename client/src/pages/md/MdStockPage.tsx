import { SapStockPanel } from '@/features/stock/SapStockPanel';

/**
 * What is in the yard, and when it was read.
 *
 * Its own tab rather than the shop floor's Stock, which the managing director
 * cannot reach and should not: that screen carries the dispatch form, the QC
 * bands and the ledger the plant kept before SAP took the yard over. None of it
 * is this account's, and a page of controls that write is not made read-only by
 * hiding the buttons.
 *
 * What is left is the figure alone, which is the whole of what this account
 * wants from it - and the date it was read, which is the part that stops the
 * figure from being believed on a morning the sync has quietly stopped.
 */
export function MdStockPage() {
  return (
    <>
      <div className="mx-0.5 mt-3">
        <h1 className="text-lg">Stock</h1>
        <div className="sub">
          What SAP holds, by grade and then by batch. The special line is
          batch-identified and the coarse line is not — its rows carry no batch and club into one
          figure, which is the shape of the thing rather than a gap in it.
        </div>
      </div>

      {/*
        The same panel the shop floor reads, deliberately. Two boards drawn off
        one feed drift, and the day they disagree is the day somebody is deciding
        whether an order can go out - so there is one, and both accounts see the
        same yard.
      */}
      <SapStockPanel />
    </>
  );
}

export default MdStockPage;
