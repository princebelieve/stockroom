# Hardware support and acceptance checks

## Reported operational testing and support

On 2026-10-07, the product owner confirmed real transactions and successful use of an XPrinter, a LaserJet printer and a barcode scanner. These are reported operational tests, not missing capabilities. The owner subsequently identified XPrinter DKT-M81 (supplied printing-speed figure: 230 mm/s), HP LaserJet P1102 (HP 85A / CE285A toner), and a 2D barcode scanner, model 8120. The speed figure is not a measured Stockroom benchmark. Connection types and individual test dates were not supplied; record those in Devices with the receipt/A4/scanner results. Existing device test records remain unchanged. No weighing scale has been selected yet.

Support is available at [support@sbi.globalcreest.com](mailto:support@sbi.globalcreest.com), general enquiries at [info@sbi.globalcreest.com](mailto:info@sbi.globalcreest.com), and [WhatsApp +234 703 392 8277](https://wa.me/2347033928277). These contacts remain on the public welcome/legal pages and are now directly accessible in the in-app guide. No message is sent automatically.

## Cash and terminal receipts

Cash checkout requires the amount received, blocks underpayment, and calculates
change in cents. Tender and change are saved in receipt snapshots, the sales
database and sync payloads. Older sales without tender details keep them unknown.

Manually recorded terminal payments use cashier confirmation. Configured businesses can also use the separate [Paystack Terminal integration](paystack-terminal.md).
Cashiers can scan a reference barcode/QR, type a reference, or choose a JPG/PNG/
WebP receipt photo (up to 15 MB). English OCR runs locally using bundled Tesseract
assets. The image/full OCR text is not stored or uploaded; only the reviewed
reference is added to the sale. Cashiers must check the original receipt's approved
status, amount, currency and reference. OCR results are suggestions, not proof
of payment. Ambiguous references require manual selection/entry. Blurry photos,
unusual layouts or unsupported image formats may need manual entry.

Windows owns printer-driver installation; the app selects installed printer queues.
Android still needs a compatible print service. OCR assets add approximately 39 MB
to the build and are included in PWA offline caching after installation finishes.

## Guided device setup

Owners and admins can open Business settings > Devices. It covers receipt
printers, A4 printers, drawers, cutters, payment terminals, scanners, and customer
displays. Each flow identifies the device, saves its operational settings, then
offers a supported test and an explicit confirmation of the observed result.
Users can finish without testing; the status then remains "Configured — test
needed". Unsupported connections are labelled "Integration unavailable" and
cannot be marked tested. Ordinary terminal profiles do not activate an adapter; connected Paystack checkout requires the separate server configuration.

Model names come from the device label/manual; there is no claimed catalog of
certified models. Printer drivers/services determine supported printer models,
ESC/POS settings determine drawer/cutter compatibility, and payment profiles
use manual confirmation except for the configured Paystack adapter. The wizard does not download
drivers or send a payment. Device model/test records are scoped to the business
and browser/device; underlying printer, drawer, scanner and display preferences
are shared on that device. Changes to operational settings invalidate old test
confirmation, including changes made while setting up a related device.

Keyboard scanner setup supports Enter and Tab terminators, applied at the POS
barcode input and payment-reference input. Camera setup uses the existing camera
scanner and reports a failure when camera detection is unavailable. Display setup
guides Windows extended-desktop or LAN browser pairing; serial pole displays are
not supported. Opening a pairing link alone never counts as a confirmed display.

## Android printing

The Android app registers the local StockroomPrinting Capacitor plugin. Receipts,
receipt reprints, test prints, and reports open Android's system print dialog.
Enable a compatible printer service in Android settings or choose Save as PDF.
Printer availability and USB/Bluetooth support depend on that service; this app
does not include direct USB/Bluetooth printer drivers.

The plugin prints an isolated HTML snapshot rather than the live checkout screen.
It disables JavaScript, network loads, and file access in the print WebView.
A4 is requested for reports; receipts request 58/80 mm paper. The printer service
may override the requested paper size. Long receipts paginate. Closing or
cancelling the print dialog does not confirm that paper was printed. Automatic
receipt printing opens the dialog; it is not silent Android printing.

## Cash drawer and paper cutter

In Business settings > Devices, configure a network ESC/POS printer's hostname/IPv4 address,
TCP port (usually 9100), drawer pin, and full/partial cut mode. These settings
are local to each device. Both Windows and Android provide manual Open cash
drawer and Feed & cut paper controls. The drawer must connect to the printer's
drawer connector, and the printer must support the selected ESC/POS commands.

The drawer pulse is ESC p with pin selector 0/1, 50 ms on and 500 ms off.
Cutting uses newline followed by GS V 65/66 0 (feed to cutter then cut).
Confirm compatibility with the printer/drawer documentation before operating.
These commands do not support direct USB, Bluetooth, or browser/PWA connections.
There is no automatic cash-sale drawer opening or automatic post-print cut in
this implementation. Use the printer driver's automatic-cut setting if offered.
Wait for printing to finish before using the manual cut control: native print
spooling and the separate TCP command stream do not guarantee ordering.

Commands time out after five seconds and are not retried automatically. A
successful send only confirms transport completion, not drawer/cutter movement.
Check the device after an error before sending another command.

## Device-specific checks when changing equipment

These checks apply when installing a new client or changing equipment. Repository checks do not certify physical devices or establish which shops have deployed the current version.

- Build/install the updated Android APK and test printing, cancellation, repeat
  jobs, app close/reopen, Save as PDF, both roll widths, long receipts, and A4.
- Test the actual network printer and drawer on Windows and Android, both cut
  modes, correct drawer pin, disconnected printer, and network timeout.
- Verify Windows printer driver output, receipt reprints, and recovery after
  out-of-paper/offline errors without recording another sale.
- Verify barcode scanner focus, repeated scans, unknown/duplicate codes, camera
  permission denial, and all supported device/browser combinations.
- Verify customer-display pairing, expiry, reconnection, secondary monitors,
  and app restart. Dedicated scanner/display automated coverage remains limited.
- Paystack is the implemented connected-terminal option; other providers remain
  manually confirmed. Test
  actual terminal receipt photos/barcodes and cashier confirmation instead.

## Implementation references

- Android HTML printing: https://developer.android.com/training/printing/html-docs
- Epson cutter command: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html

These references describe the mechanisms, not compatibility with every printer.

## Preparation printer routing

In Windows Device settings, select Kitchen ticket printer and Bar ticket printer from installed queues, then enable automatic preparation routing. One queue can serve both stations if needed. Sending, correcting, cancelling or accepting an order creates station tickets locally. Failed or interrupted tickets remain visible for explicit retry; check physical output first to avoid duplicate paper. Driver acceptance is not proof that paper printed. Browser and Android printing continue through the system dialog and do not silently select station queues.

Lost or broken till recovery is owner-only under Device settings. It requires a separately enrolled replacement, cloud connectivity, no active replacement work, owner password and confirmation that the original device has stopped and unsynchronized activity has been reconciled. The source enrollment is permanently retired and its checkout identity is restored on the replacement; historical documents are retained. See [Fast food recovery](fast-food-workspace.md#devices-and-recovery).

## Shared preparation printing

On the Windows checkout that will print for the branch, configure installed Kitchen and Bar queues, then choose **Use this checkout as branch printer** under Shared kitchen and bar printing in Devices. Only the owner can designate the printer. Keep that checkout signed in, open, connected, and on the selected branch. Orders sent from Android, browser or other Windows devices enter the queue after synchronization. Unaccepted QR orders are not printed; accept them on a till first. Local routing is suppressed when shared routing is enabled to prevent duplicate tickets.

New orders, corrections and cancellations produce station tickets. Pending stale tickets are superseded by corrections; removed station items get cancellation tickets. A claimed ticket whose printing or acknowledgement was interrupted stays visible. Inspect physical output before **Retry ticket (may print twice)**. There is no automatic retry of uncertain output. Turning on shared printing does not replay earlier historical orders. No shared routing works through an internet outage; synchronized orders remain available for later handling.

## Windows backup and restore

Owners open **Business settings > Business > Business backup and restore**. Download a password-protected backup, or enter a backup password and choose a folder for daily scheduled backups. Prefer an external drive or a folder copied to secure off-device storage. Scheduled backups run while the Windows app is open, with the latest successful time and failures shown in settings. Windows secure storage protects the saved password. Keep a separate copy of the password; it cannot be recovered from the encrypted backup.

Restore requires the matching business and checkout identity, with a supported database schema, the file password, current owner password and RESTORE confirmation. Stop staff using that checkout and synchronize before replacing its local records. Current credentials and removed-staff tombstones are preserved. A consistent local safety backup is created first. For replacement hardware, use lost-till recovery before restoring a matching checkout archive. Browser and Android continue to use synchronization and lost-till recovery; this file backup/restore control is Windows-only.

Backups are separate from the product export-and-exit flow. Catalogue downloads require a current active subscription or trial (or developer test mode), plus the developer-configured one-time export fee when nonzero. Trading grace does not authorize catalogue downloads. An export payment already started retains its quoted fee. Reports and encrypted backups are not subject to this catalogue gate.

## Weighed goods

Owners/admins open **Business settings > Devices > Weighed goods hardware**. Settings apply to this business on this checkout device; configure other checkouts separately. No weighing scale model has been physically verified for this installation. The implemented connections are keyboard-output readings and the exact EAN-13 weight-label format below. Serial-only RS-232/USB-serial protocols, live weight polling, vendor SDKs and price-encoded barcodes require separate adapters and are not advertised as connected.

For a USB/Bluetooth keyboard-output scale, pair it through the operating system and configure it to type a positive decimal reading, optionally followed by `kg` or `g`, into the focused **Scale reading** field. Set the bare reading unit in Devices. Products must be stocked and priced per kg. `1.250 kg` and `1250 g` both yield `1.25` kg. Unstable/protocol strings, negative or zero weights and quantities finer than one gram are rejected. Tare and stability are handled on the scale; this app does not command them.

For printed labels, configure the scale to use **2-digit prefix (20-29) + 5-digit product code + 5-digit grams + EAN check digit**. Enable labels and map each scale product code to a kg stock product. The app validates checksum, code mapping and nonzero quantity. A barcode whose configured prefix matches but whose weight layout is invalid is rejected rather than added as one ordinary item. Other barcodes continue through normal product scanning. Price-encoded labels must not use the configured weight prefix.

In Product sales, choose **Weighed product**, focus **Scale reading**, send the stable reading and select **Review measured weight**; or scan a configured label through the existing scanner/camera. Review the captured product and net kg, acknowledge the stable reading or label, then **Add measured quantity**. Cancel changes no stock or basket. Repeated confirmed parcels add their measured quantities; the normal receipt, tax, refunds and stock ledger use those quantities. The checkout rejects quantities above available stock and blocks measured additions during payment. Manual quantity entry remains available.

Acceptance with actual hardware remains required: test tare, a known reference weight, g/kg output, stable and moving readings, disconnect/reconnect, correct/unknown/damaged labels, cancellation, low stock, receipt and returned quantity. Verify Windows/browser/Android keyboard behavior on the intended devices. Do not mark a model as verified based on automated tests or a typed sample.

## Trading-day acceptance and staff handover

Cash-register entries retain a command identity through an interrupted response and reload. Retry the original values or choose **Refresh and recover register entries** to check saved work before making another entry. Count and close the outgoing shift on the original till before the incoming cashier opens theirs. Owners/admins can use **Review staff shift on this till** to close another staff member's shift. Synchronize before handover between devices; offline devices cannot establish that another device has finished its work.

The simulated trading-day test opens with 100, takes 30 cash, refunds 10 and pays out 3: expected closing cash is 117. The next cashier opens with 117, an owner refunds 5 from that till, and closing cash is 112. Separate checks cover retained cash extras, stale changes, permissions, transaction rollback and retries. Browser checks simulate a saved cash movement whose response is lost, then reload and retry without recording it twice. These checks do not certify physical devices or a live business.

For the supervised pilot, use real opening stock and cash; cash, confirmed bank transfer and split payments; saved receipts and reprints; partial returns and restocking; petty cash; counted closing cash and explained differences; and outgoing/incoming staff shifts. Repeat an internet outage, synchronization recovery and replacement-device recovery. Check the actual scanner, receipt printer, cash drawer and any weighing scale with the intended Windows/browser/Android devices before relying on them during a queue. Update the sync service and participating apps before shared shift use.

### Backup compatibility after updates

New encrypted backups include source table and column metadata. Restoration supports additive upgrades: retained columns must keep their names, types, primary-key and required-field properties; additional columns must be nullable or have defaults. New tables start empty and constraints are checked before committing. Renamed/removed tables or columns and new mandatory fields without defaults require a dedicated migration and are rejected atomically. Current credentials and staff removal records remain protected.

Older backups without metadata also restore across recognised historical field additions when the original structure fingerprint can be verified, including empty tables and the addition of local review history. For an unrecognised older structure, contact support or restore using the original compatible app first and create a metadata-bearing backup; arbitrary older-version conversion is not supported. Retain the original backup until recovery has been verified.
