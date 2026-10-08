# Product entry, registration and settings sync review

The supplied images are workflow references. Their text is not a separate set of instructions. Desktop remains a desktop layout; mobile forms and controls adapt to the available space.

| Reference behaviour | Previous implementation | Change and verification |
| --- | --- | --- |
| Add/search products independently of the product list | Creation was reached through the inventory list, import tools or starter catalogue | Added **Add or search product** with search, barcode scanning and opening existing records. |
| Unknown barcode offers Dismiss or Add Product | Checkout search could simply return no results; intake opened a draft | Product search now offers **Dismiss** or **Add product**, preserving the scanned barcode in the draft. |
| Leave product entry without saving | A barcode effect moved React's input into a manually created DOM wrapper, making unmounting unsafe | Removed the DOM reparenting. Barcode controls render through React. Close, Cancel and Escape dismiss the form; cancelling after scanning saves no product. |
| Reach form controls on a phone | Long form inside a modal with no persistent Cancel action | Mobile uses one column, a sticky close header and sticky Cancel/Save controls. Keyboard focus remains inside product entry; nested barcode prompts retain their own focus. |
| Product list shows value, cost, count and stock choices | These were not presented together in the product list | Added current-branch goods value, cost and unique product count, a Low stock filter and an Expiring stock link to the existing batch/expiry workflow. |
| Separate customer list and creation task | Already separate, but customer creation lacked Cancel | Added Cancel, returning to the list without creating an account. The full demographic/address form shown in the reference is not implemented by this change; current creation retains name and phone, with birthdays managed separately. |
| Clear synchronization state | Indicator ignored unresolved conflicts and could say Up to date | Unresolved conflicts now show **needs review**, even with zero queued operations. |

## Settings conflict investigation

The cloud compared mutable snapshots using a strict timestamp comparison. Two sequential settings saves with the same timestamp could therefore conflict on the same device. Refresh also applied settings snapshots without checking whether they were older than the local row or whether unsent local settings existed.

Settings saves now advance their timestamps monotonically on desktop, browser and native mobile. Same-device settings timestamp ties are accepted; different-device edits still require conflict handling. Identical settings content with an older timestamp can be acknowledged without treating it as a different edit. Refresh preserves unsent local settings and retries them after upload, and does not roll an accepted settings row back to an older snapshot.

These corrections address reproducible failure paths. They do not prove the cause of the particular existing phone conflict without its local/remote versions, and they do not erase or automatically resolve that conflict.

## Registration email

The supplied Render startup log confirms that four Gmail environment variables are present. It does not establish that Google accepts the refresh token, that its scope permits Gmail sending, or that Gmail accepted the registration message.

Mail now trims OAuth credentials, refreshes and retries once after an explicit Gmail 401 rejection, and retains safe failure stage/code/status diagnostics. Uncertain timeouts are not automatically resent, and issued keys remain redeemable until expiry. The startup authorization check sends no email and logs no credential values. A successful authorization check establishes authorization only, not inbox delivery.

Deploy the updated cloud code, then inspect **Mail authorization** and, if registration fails, **Registration email failed**. `invalid_grant` requires repairing the Google authorization/refresh token; `gmail_scope_missing` requires sending permission; send-stage 403/429 results identify permission or rate-limit failures. Live email delivery remains unverified until those results are available. Do not paste keys, tokens or passwords into a support conversation.

## Verification

Production build passed. 305 automated tests passed. Browser checks passed for mobile and desktop navigation, product close/cancel/Escape, unknown-barcode dismissal, cancelling after scanning, zero product writes on cancellation, conflict status, customer/supplier tasks, saved setup and checkout. A rendered mobile product form was inspected at `.audit/product-entry-mobile.png`.
