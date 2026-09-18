# Hardware support and acceptance checks

## Cash and terminal receipts

Cash checkout requires the amount received, blocks underpayment, and calculates
change in cents. Tender and change are saved in receipt snapshots, the sales
database and sync payloads. Older sales without tender details keep them unknown.

Terminal payments use cashier confirmation, not a direct provider connection.
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

Owners and admins can open Settings → Device setup wizard. It covers receipt
printers, A4 printers, drawers, cutters, payment terminals, scanners, and customer
displays. Each flow identifies the device, saves its operational settings, then
offers a supported test and an explicit confirmation of the observed result.
Users can finish without testing; the status then remains "Configured — test
needed". Unsupported connections are labelled "Integration unavailable" and
cannot be marked tested. Terminal setup always identifies automatic payment
integration as unavailable, including when manual fallback is allowed.

Model names come from the device label/manual; there is no claimed catalog of
certified models. Printer drivers/services determine supported printer models,
ESC/POS settings determine drawer/cutter compatibility, and payment profiles
remain manual until a provider adapter exists. The wizard does not download
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

In Admin Settings, configure a network ESC/POS printer's hostname/IPv4 address,
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

## Remaining acceptance work

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
- Direct payment-terminal integration is outside the selected receipt-confirmation
  workflow. It is not a release requirement for manual receipt recording. Test
  actual terminal receipt photos/barcodes and cashier confirmation instead.

## Implementation references

- Android HTML printing: https://developer.android.com/training/printing/html-docs
- Epson cutter command: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html

These references describe the mechanisms, not compatibility with every printer.
