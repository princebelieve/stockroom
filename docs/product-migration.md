# Bringing an existing shop's products into Stockroom

Use the existing catalogue export where available. CSV import avoids typing or photographing every product. Product entry does not require a supplier, batch number or expiry date; those optional details belong to delivery receiving.

## Supported file

Open Inventory and expand **Add products from a photo, barcode or file**, then choose **CSV product file**. Export a spreadsheet as CSV smaller than 2 MB. The importer suggests these headings without regard to case. Use **Match CSV columns** for other headings, then **Load mapped products for review**:

| Field | Accepted headings | Meaning |
| --- | --- | --- |
| Name | Name, Product, Product Name, Title | Product description; required |
| SKU | SKU, Item Code, Product Code, Code | Optional existing product identity |
| Barcode | Barcode, EAN, UPC, GTIN | Optional; retain leading zeros |
| Category | Category, Department | Optional grouping |
| Unit | Unit, UOM | Selling unit; falls back to the shop's usual unit |
| Price | Price, Selling Price, Retail Price | Selling price per unit; enter explicitly |
| Cost | Cost, Cost Price | Purchase cost per unit; blank saves as zero |
| Stock | Stock, Quantity, Opening Stock | Current stock in selling units; enter explicitly, including zero |
| Reorder | Reorder, Reorder Point | Optional; blank saves as zero |

Example:

```csv
Name,Barcode,Category,Unit,Price,Cost,Stock,Reorder
Example bottled drink,0123456789012,Drinks,bottle,500,350,48,6
Example rice,,Food,kg,1800,1400,25.5,5
```

These are sample records, not suggested market prices. Use a decimal point. Price/cost values also accept a leading naira symbol or NGN and thousands commas. Prices, costs and stock must refer to the same unit: a carton purchase cost must be converted to bottle cost if bottles are sold. Future deliveries can use the app's product-specific carton conversions.

## Review and cutover

1. Export the previous app's current product list. Retain the original export; map its headings to the displayed fields without renaming the original file.
2. Start with a few rows and compare product names, units, prices, costs and stock after import.
3. Select and review rows before saving. Existing barcode/SKU matches are skipped by default; their stock and details remain unchanged. Conflicting barcode/SKU identities and duplicate selected identities require correction. Name-only duplicates are not merged. To change an existing product, use its price/details/stock workflows rather than import another opening balance.
4. Import the remaining reviewed rows. Confirmed saved rows disappear from the review; a later failure leaves unfinished rows. After an uncertain connection failure, refresh inventory before retrying.
5. Agree when the old app stops recording new movements and confirm opening quantities at that point. Continuing to sell in both apps does not synchronize them automatically.
6. Synchronize Stockroom and compare stock and selling/purchase values before relying on its reports.

The importer creates products and opening stock. It does not transfer historical sales, customer balances, old profit reports or expiry lots. Supplier debt/credit can be entered once under Supplier balances and payments; column mapping supports old CSV layouts. Customer balances and other cutover data require their existing workflows and separate checks. Historical purchase costs cannot be inferred from a product name or barcode.

Photo, barcode lookup and paper-form entry remain alternatives for missing products. OCR suggestions require review and online barcode lookup is not a complete catalogue. An invoice quantity is a delivery quantity, not necessarily stock currently on the shelf; image intake does not treat it as opening stock automatically. For dated goods already on hand, the opening stock has no expiry unless an owner records the information using batch correction. Mixed expiry stock needs separate delivery/batch records; one opening batch cannot represent several dates accurately.

Column mapping and existing-product skipping are covered by `test/product-migration.browser.mjs`; CSV parsing, invalid mapping and conflicting identities also have automated Node tests.
