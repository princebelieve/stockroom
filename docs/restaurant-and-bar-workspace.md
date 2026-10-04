# Restaurant & bar workspace

In **Business settings > Business type > Payment screens**, choose **Restaurant & bar only**. For a mixed business, keep your existing payment-screen choice and check **Enable separate Restaurant & bar workspace**, then **Save payment screens**.

This adds its own navigation screen, menu, table setup, bill sessions and orders. Fast food and supermarket screens keep their existing operations. Existing products can be linked explicitly to packaged menu offerings or recipes; payment-only receipt descriptions remain independent of stock.

## Everyday use

1. Open **Restaurant & bar**. The owner or administrator uses **Set up tables and seats** to add named tables and their seat counts. Occupied tables cannot be renamed, removed or resized.
2. In **Menu**, add meals and drinks, prices and extras. Choose **Kitchen** or **Bar** for preparation tickets. Use **Recipes** for per-portion ingredients and extras, or **Packaged stock** for bottled drinks linked to a stock product.
3. Select a free table and enter its guest count, or use **Open bar tab** to name a customer/group without a table. Each opening creates a new bill session. This device remembers the selected bill when you reload or switch screens; it never substitutes a later customer's session at the same table.
4. Add menu items to a **New order**, selecting a seat or **Whole table / shared**. **Send for preparation** saves that round on the open bill. Submit another round whenever guests order more. Menu price changes do not alter saved rounds.
5. Use **Orders** or **Preparation** to start preparation, mark the whole round ready, then **Mark served**. Restaurant orders may be served before payment. Kitchen and bar tickets contain only that station's lines, table/tab name, seat and preparation note. This routes printed content; choose the printer through the existing print controls. It does not automatically connect or buy another printer service.
6. The bill lists all non-cancelled rounds, descriptions, quantities, prices, seats and payment status. **Print itemized bill** prints a bill for review; an unpaid bill is clearly identified as unpaid.
7. Use **Settle remaining bill** to record the remaining rounds together, or **Take payment** on individual rounds when guests pay separately. Cash supports change; transfer/terminal methods require a provider and externally confirmed reference. Settlement saves one receipt per order and the itemized paid bill links those receipt IDs. If rounds are added, corrected, cancelled or paid after payment entry begins, the app stops settlement and asks the cashier to review the updated bill. Preparation progress alone does not interrupt payment. It does not create another revenue transaction or initiate a terminal charge. Arbitrary splitting of one order between guests or payment methods is not included.
8. **Close bill and free table** is available once every round is served or cancelled and every non-cancelled round has a saved payment. Closed sessions remain available for bill reprinting after a table is opened again.

## Corrections, costs and devices

Unpaid queued rounds can be corrected on their original till, with a reason. Later cancellations retain their history. Paid unserved rounds must be refunded in full before cancellation. Existing returns handle refunds; ingredients already cooked are not restored. Recipe ingredients and linked packaged drinks are consumed when restaurant preparation starts, using the existing stock and cost operations. Later payment never deducts them again. Cancelling an unpaid served round requires an owner or administrator and retains consumed stock/cost. Refunds do not automatically restore prepared food or drinks; return unopened goods through an explicit stock adjustment when appropriate.

Orders and payment settlement use the till that opened the bill. Preparation progress can be shared through the existing synchronization workflow; recipe preparation still starts on the original till. Before using shared tables, synchronize and use one till to manage each open bill. Different offline devices cannot see each other's newly opened tables; conflicting occupancy is rejected during sync for owner review.

Use **Sync tables and bills** to share records. No new paid service or sync subscription is introduced. All participating apps and the existing sync backend must support `restaurant-v1` as well as `counter-v3`; update that backend before sharing restaurant records. Older servers leave uploads queued, and older clients are prevented from downloading restaurant records they cannot handle.

If a multi-round settlement stops partway through, completed receipts remain saved. Refresh and review the remaining unpaid rounds and cash/refund obligations before continuing; do not record the whole original payment again. The app is not a hotel, booking, nightclub admission or reservation system.
