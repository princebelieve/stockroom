# Handwritten product forms

## Owner workflow

**Autofill on this device** reads the marked form using the app's bundled English Tesseract engine. No Google account, key, billing setup or photo upload is needed. The reader files must already be installed or cached for offline operation. Printed text is its strength; block-capital handwriting may or may not be readable. Low-confidence results remain empty and all suggestions require review. This option is independent of the optional Google setup below. Both readers preserve already-entered values, including zero, and manual entry remains available if either reader fails or is cancelled.

1. Print **Print blank product form** beside **Add product**. Use the current template with markers F01–F10. Older unmarked copies are not supported by the dedicated reader.
2. Photocopy one blank sheet per product. Write clearly in the empty area below each heading, not beside or over the printed instructions. Keep stock and prices in the same unit. Use a decimal point; a comma is only accepted as a thousands separator.
3. In Inventory, open **Upload completed product form**. Select one full-page, upright JPG/PNG/WebP photo, with all four corners and markers visible. Maximum input size is 15 MB; the app prepares a JPEG up to 2400 pixels on its longest side and approximately 3 MB for upload. Very small images are rejected.
4. Editable fields appear immediately beside the photo. Enter and save details manually without Google recognition; manual entry needs no cloud connection on an already set-up device. For best recognition results, write in BLOCK / CAPITAL LETTERS. Optionally agree to send the photo to Google Cloud Vision and select **Read completed form**. Suggestions fill empty fields without replacing your entries. If recognition is unavailable or cancelled using **Stop reading and enter manually**, your photo and entries remain available for manual completion.
5. Compare every answer with the photo. Low-confidence, invalid, blank or ambiguous answers remain empty. Fill missing information, select the review confirmation, then save. Editing any field clears the confirmation. Recognition does not create products automatically.

Google recognition needs a cloud session and internet access; on-device recognition needs the bundled reader assets installed or cached. Products save through the existing local product workflow. Blank SKU is generated; blank cost and reorder values save as zero, as stated on the review screen. Price, stock and unit require explicit entries. Existing barcodes/SKUs in the loaded catalogue are checked before saving.

## New Google Cloud Vision setup

This integration is not enabled simply by having Firebase configured. Do not use the public Firebase web/Android API key or ship a service-account JSON in a client build.

1. In the Google Cloud project you want billed, enable billing and the **Cloud Vision API**. See [Google's setup guide](https://docs.cloud.google.com/vision/docs/setup).
2. Create a separate server API key under **APIs & Services → Credentials**. Restrict its API access to **Cloud Vision API**. If your cloud host has stable outbound IP addresses, apply those IP restrictions as well. Browser-referrer restrictions are not suitable for this server-to-server request. See [Google's API key guide](https://docs.cloud.google.com/docs/authentication/api-keys).
3. Set `GOOGLE_CLOUD_VISION_API_KEY` in the environment of the hosted **cloud sync API** (the service running `cloud/index.mjs`, currently the Render service). Never put it in `VITE_` variables, Android files, source control or chat. Restart/redeploy that cloud service after setting it.
4. Deploy the updated cloud API and app. For Windows, include the updated local server proxy; Android needs an updated client build. The feature is not deployed by a local build.
5. Set provider quotas and billing alerts appropriate for your usage. This app also enforces 4 readings per minute and 60 per UTC day per business through MongoDB counters. Attempts reaching the provider count toward these limits, including failed recognition. Google charges follow its [current pricing](https://cloud.google.com/vision/pricing).
6. Sign in as a business owner and try a newly printed form. An authenticated `GET /v1/product-forms/status` reports whether a key is present; it does not certify that the key, billing or provider quota works.

The server uses [DOCUMENT_TEXT_DETECTION for handwriting](https://docs.cloud.google.com/vision/docs/handwriting) and sends the API key in the `X-Goog-Api-Key` header. The app sends images through its authenticated cloud endpoint, not directly with exposed provider credentials.

## Data handling and limitations

The cloud service passes the photo to Google for recognition and does not persist the photo or raw OCR response. Persistent usage counters contain a business identifier, count and expiry only. The client holds the selected image and results in memory until the owner leaves or saves; they are not draft backups. Google processes the image under its Cloud Vision terms; this is not offline OCR.

Only marked, upright, single-product forms are supported. Missing, duplicated, rotated or badly aligned markers reject the image rather than shift answers into the wrong fields. Printed headings and hints are excluded using their positions. OCR words below the 0.88 confidence threshold produce an empty, uncertain field. Provider confidence is not a guarantee of correctness; even high-confidence answers require owner review. Crossed-out answers, writing outside the boxes, faint photocopies, shadows and ambiguous digits can require manual entry or a new photo.

## Validation before rollout

The browser test also exercises the real on-device reader on a generated printed form image while blocking external traffic. It verifies field autofill and preservation of owner entries. This demonstrates local printed-text reading, not real handwriting accuracy. Real handwritten samples are still needed before making accuracy claims for either reader.

Automated parser and endpoint tests use synthetic Vision responses. Browser checks can mock the provider to verify upload, review and saving; those do not establish handwriting accuracy. The integration must also be checked with real, owner-written forms after the server key is configured. Test legible handwriting, zero values, empty boxes, decimal costs, leading-zero barcodes, crossed-out answers, faint photocopies and tilted photos. Compare all nine fields with the original, and keep manual review mandatory.

Commands: `node --test test/product-form.test.mjs`, `node test/handwritten-product-form.browser.mjs`, and `npm.cmd run build`.

## Existing-shop migration

For a catalogue already stored electronically, start with [CSV product migration](product-migration.md). Paper forms and OCR are review aids, not a requirement to enter every product again. No supplier, batch label or expiry date is required on a product form. Enter a purchase cost where known: blank cost saves as zero and can overstate estimated profit.
