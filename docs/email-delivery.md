# Hospitality guest email

Stockroom sends hospitality guest messages through the Gmail API sender already used by the app. It does not require a second email provider or a business owner's Gmail credentials.

## Business owner controls

Open **Business settings → Paystack and guest email** as the business owner. Set the business display name, Reply-To address and contact name, and the opening text for confirmations, reminders, cancellations, no-shows and waitlist offers. The templates support `{guestName}` and `{businessName}`. Replies go directly to the configured business mailbox; Stockroom does not read incoming replies.

The same screen lists guest messages for that business, including recipient, subject, message content, send status and time. This history is scoped by the authenticated business account.

## What the status means

Stockroom records **accepted** when the Gmail API successfully accepts a message request. Gmail API does not provide Stockroom with a recipient-delivery or read receipt in this implementation. A failed send is recorded as failed with its error. The sender remains the centrally configured Gmail account; business settings customize the message content and Reply-To address, not the sender credentials.

## Cloud configuration

Configure the existing Gmail API OAuth variables in Render: `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN`. Follow the Gmail API setup instructions in [the cloud service README](../cloud/README.md). These credentials belong to Stockroom's sender account and must never be requested from individual businesses.
